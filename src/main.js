import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Pickr from '@simonwep/pickr'

// ---- L-System Engine ----
// Each character is tagged with the generation it was "born" in.
// Gen 0 = axiom chars. When a rule expands a char, the new chars get the current gen+1.
function generateAllGenerationsTagged(axiom, rules, iterations) {
  // Each entry: { chars: string, birthGens: Uint8Array }
  let chars = axiom
  let births = new Uint8Array(axiom.length) // gen 0

  const gens = [{ chars, births: new Uint8Array(births) }]

  for (let i = 0; i < iterations; i++) {
    let nextChars = ''
    const nextBirths = []
    for (let j = 0; j < chars.length; j++) {
      const ch = chars[j]
      const replacement = rules[ch]
      if (replacement) {
        nextChars += replacement
        for (let k = 0; k < replacement.length; k++) {
          nextBirths.push(i + 1) // born this generation
        }
      } else {
        nextChars += ch
        nextBirths.push(births[j]) // inherited from parent
      }
    }
    chars = nextChars
    births = new Uint8Array(nextBirths)
    gens.push({ chars, births: new Uint8Array(births) })
  }

  return gens
}

function generateAllGenerations(axiom, rules, iterations) {
  return generateAllGenerationsTagged(axiom, rules, iterations).map(g => g.chars)
}

function generateLSystem(axiom, rules, iterations) {
  const gens = generateAllGenerations(axiom, rules, iterations)
  return gens[gens.length - 1]
}

// ---- Turtle Interpreter ----
// If birthGens is provided, also outputs segmentBirths (which gen each segment was born in)
function interpretString(str, angle, len, twist, branchColor, leafColor, birthGens) {
  const vertices = []
  const colors = []
  const segmentBirths = []
  const stack = []

  let pos = new THREE.Vector3(0, 0, 0)
  let quat = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)

  const branchC = new THREE.Color(branchColor)
  const leafC = new THREE.Color(leafColor)

  const rad = angle * Math.PI / 180
  let charIdx = 0

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    const birth = birthGens ? birthGens[i] : 0

    switch (ch) {
      case 'F':
      case 'A':
      case 'B': {
        const dir = up.clone().applyQuaternion(quat).multiplyScalar(len)
        const newPos = pos.clone().add(dir)
        vertices.push(pos.x, pos.y, pos.z, newPos.x, newPos.y, newPos.z)
        const c = (ch === 'F' || ch === 'A') ? branchC : leafC
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
        segmentBirths.push(birth)
        pos = newPos
        break
      }
      case 'X': {
        const dir1 = up.clone().applyQuaternion(quat)
        const left = new THREE.Vector3(1, 0, 0).applyQuaternion(quat)
        const leafLen = len * 0.5
        const tip1 = pos.clone().add(dir1.clone().multiplyScalar(leafLen)).add(left.clone().multiplyScalar(leafLen * 0.3))
        const tip2 = pos.clone().add(dir1.clone().multiplyScalar(leafLen)).sub(left.clone().multiplyScalar(leafLen * 0.3))
        vertices.push(pos.x, pos.y, pos.z, tip1.x, tip1.y, tip1.z)
        vertices.push(pos.x, pos.y, pos.z, tip2.x, tip2.y, tip2.z)
        colors.push(leafC.r, leafC.g, leafC.b, leafC.r, leafC.g, leafC.b)
        colors.push(leafC.r, leafC.g, leafC.b, leafC.r, leafC.g, leafC.b)
        segmentBirths.push(birth)
        segmentBirths.push(birth)
        break
      }
      case '+': {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rad)
        quat.multiply(q)
        if (twist > 0) {
          const yRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * twist * Math.PI)
          quat.multiply(yRot)
        }
        break
      }
      case '-': {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad)
        quat.multiply(q)
        if (twist > 0) {
          const yRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * twist * Math.PI)
          quat.multiply(yRot)
        }
        break
      }
      case '^': { // Pitch up (rotate around X)
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rad)
        quat.multiply(q)
        break
      }
      case '&': { // Pitch down (rotate around X, opposite)
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rad)
        quat.multiply(q)
        break
      }
      case '\\': { // Roll left (rotate around Y)
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad)
        quat.multiply(q)
        break
      }
      case '/': { // Roll right (rotate around Y, opposite)
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rad)
        quat.multiply(q)
        break
      }
      case '[':
        stack.push({ pos: pos.clone(), quat: quat.clone() })
        break
      case ']':
        if (stack.length > 0) {
          const state = stack.pop()
          pos = state.pos
          quat = state.quat
        }
        break
    }
  }

  return {
    vertices: new Float32Array(vertices),
    colors: new Float32Array(colors),
    segmentBirths: new Uint8Array(segmentBirths)
  }
}

// ---- Three.js Scene ----
const container = document.getElementById('canvas-container')
const scene = new THREE.Scene()
scene.background = new THREE.Color('#09090b')

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000)
camera.position.set(0, 50, 100)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(container.clientWidth, container.clientHeight)
renderer.setPixelRatio(window.devicePixelRatio)
container.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05

// Grid helper
const grid = new THREE.GridHelper(200, 40, '#1a1a2e', '#1a1a2e')
scene.add(grid)

// Ambient light
scene.add(new THREE.AmbientLight(0xffffff, 0.5))

let currentMesh = null

// ---- Presets ----
const PRESETS = {
  '3D Tree': {
    axiom: 'X',
    rules: { X: 'F-[[X]+X]+F[+FX]-X', F: 'FF' },
    angle: 25, iterations: 5, length: 3, twist: 0.5,
    branchColor: '#D2A679', leafColor: '#006600'
  },
  'Fractal Weed': {
    axiom: 'X',
    rules: { X: 'F-[[X]+X]+F[+FX]-X', F: 'FF' },
    angle: 22.5, iterations: 6, length: 2, twist: 0,
    branchColor: '#556B2F', leafColor: '#7CFC00'
  },
  'Sierpinski': {
    axiom: 'A',
    rules: { A: '+B-A-B+', B: '-A+B+A-' },
    angle: 60, iterations: 7, length: 2, twist: 0,
    branchColor: '#00C8C8', leafColor: '#00C8C8'
  },
  'Dragon Curve': {
    axiom: 'FX',
    rules: { X: 'X+YF+', Y: '-FX-Y' },
    angle: 90, iterations: 12, length: 2, twist: 0,
    branchColor: '#FF6B6B', leafColor: '#FF6B6B'
  },
  'Koch Snowflake': {
    axiom: 'F++F++F',
    rules: { F: 'F-F++F-F' },
    angle: 60, iterations: 4, length: 2, twist: 0,
    branchColor: '#87CEEB', leafColor: '#87CEEB'
  },
  'Bush': {
    axiom: 'F',
    rules: { F: 'FF+[+F-F-F]-[-F+F+F]' },
    angle: 22.5, iterations: 4, length: 3, twist: 0.2,
    branchColor: '#6B8E23', leafColor: '#32CD32'
  },
  'Hilbert': {
    axiom: 'X',
    rules: { X: '-YF+XFX+FY-', Y: '+XF-YFY-FX+' },
    angle: 90, iterations: 6, length: 2, twist: 0,
    branchColor: '#9370DB', leafColor: '#9370DB'
  },
  'Hilbert Cube': {
    axiom: 'X',
    rules: { X: '^\\XF^\\XFX-F^//XFX&F+//XFX-F/X-/' },
    angle: 90, iterations: 3, length: 4, twist: 0,
    branchColor: '#E040FB', leafColor: '#7C4DFF'
  },
  'Levy Curve': {
    axiom: 'F',
    rules: { F: '+F--F+' },
    angle: 45, iterations: 14, length: 2, twist: 0,
    branchColor: '#FF69B4', leafColor: '#FF69B4'
  },
  'Gosper Curve': {
    axiom: 'A',
    rules: { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' },
    angle: 60, iterations: 4, length: 3, twist: 0,
    branchColor: '#FF8C00', leafColor: '#FF8C00'
  }
}

// ---- Color Pickers ----
function createPicker(elId, defaultColor) {
  const pickr = Pickr.create({
    el: `#${elId}-picker`,
    theme: 'nano',
    default: defaultColor,
    components: {
      preview: true,
      opacity: false,
      hue: true,
      interaction: { hex: true, input: true, save: true }
    }
  })
  pickr.on('save', (color) => {
    const hex = color.toHEXA().toString()
    document.getElementById(`${elId}-hex`).textContent = hex
    pickr.hide()
  })
  return pickr
}

const branchPickr = createPicker('branchColor', '#D2A679')
const leafPickr = createPicker('leafColor', '#006600')

// ---- UI ----
function loadPreset(name) {
  const p = PRESETS[name]
  document.getElementById('axiom').value = p.axiom
  document.getElementById('angle').value = p.angle
  document.getElementById('iterations').value = p.iterations
  document.getElementById('length').value = p.length
  document.getElementById('twist').value = p.twist
  branchPickr.setColor(p.branchColor)
  document.getElementById('branchColor-hex').textContent = p.branchColor
  leafPickr.setColor(p.leafColor)
  document.getElementById('leafColor-hex').textContent = p.leafColor

  // Set rules
  const rulesDiv = document.getElementById('rules')
  rulesDiv.innerHTML = ''
  for (const [key, val] of Object.entries(p.rules)) {
    addRuleRow(key, val)
  }

  render()
}

function addRuleRow(char = '', production = '') {
  const div = document.createElement('div')
  div.className = 'rule-row'
  div.innerHTML = `
    <input type="text" value="${char}" maxlength="1" placeholder="X">
    <input type="text" value="${production}" placeholder="F+[X]-X">
    <button onclick="this.parentElement.remove()">×</button>
  `
  document.getElementById('rules').appendChild(div)
}

window.addRule = () => addRuleRow()

// Render built-in presets as chips
const presetsDiv = document.getElementById('presets')
for (const name of Object.keys(PRESETS)) {
  const btn = document.createElement('div')
  btn.className = 'preset'
  btn.textContent = name
  btn.onclick = () => loadPreset(name)
  presetsDiv.appendChild(btn)
}

// ---- Animation State ----
let animationTimer = null
let cachedGenerations = null
let cachedGeometries = null // pre-rendered geometries for each gen
let currentGenIndex = 0
let isPlaying = false
let drawProgress = null // { startTime, duration, totalSegments, genIndex }
let growthMode = true   // true = growth animation, false = instant
let autoFrame = true    // true = auto-center camera on each gen

function preRenderAllGenerations(taggedGens, angle, len, twist, branchColor, leafColor) {
  return taggedGens.map(gen => {
    if (gen.chars.length > 5000000) return null
    return interpretString(gen.chars, angle, len, twist, branchColor, leafColor, gen.births)
  })
}

function showGeometry(data, genIndex, totalGens, segmentCount) {
  if (currentMesh) {
    scene.remove(currentMesh)
    currentMesh.geometry.dispose()
    currentMesh.material.dispose()
    currentMesh = null
  }

  if (!data) return

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))

  const totalVerts = data.vertices.length / 3
  if (segmentCount !== undefined && segmentCount < totalVerts) {
    geometry.setDrawRange(0, segmentCount)
  }

  const material = new THREE.LineBasicMaterial({ vertexColors: true })
  currentMesh = new THREE.LineSegments(geometry, material)
  scene.add(currentMesh)

  return geometry
}

function centerCamera(data) {
  if (!data) return
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3))
  geometry.computeBoundingSphere()
  const sphere = geometry.boundingSphere
  if (sphere) {
    controls.target.copy(sphere.center)
    const dist = sphere.radius * 2.5
    camera.position.set(sphere.center.x, sphere.center.y + dist * 0.3, sphere.center.z + dist)
    controls.update()
  }
  geometry.dispose()
}

function updateUI(genIndex, totalGens, segments, extra) {
  document.getElementById('stats').textContent =
    `Iteration ${genIndex}/${totalGens - 1} | ${segments.toLocaleString()} segments` + (extra ? ` | ${extra}` : '')

  const slider = document.getElementById('gen-slider')
  if (slider) {
    slider.max = totalGens - 1
    slider.value = genIndex
  }
  const label = document.getElementById('gen-label')
  if (label) label.textContent = `${genIndex} / ${totalGens - 1}`
}

function getParams() {
  const axiom = document.getElementById('axiom').value
  const angle = parseFloat(document.getElementById('angle').value)
  const iterations = parseInt(document.getElementById('iterations').value)
  const len = parseFloat(document.getElementById('length').value)
  const twist = parseFloat(document.getElementById('twist').value)
  const branchColor = branchPickr.getColor().toHEXA().toString()
  const leafColor = leafPickr.getColor().toHEXA().toString()

  const rules = {}
  document.querySelectorAll('.rule-row').forEach(row => {
    const inputs = row.querySelectorAll('input')
    const char = inputs[0].value.trim()
    const prod = inputs[1].value.trim()
    if (char && prod) rules[char] = prod
  })

  return { axiom, angle, iterations, len, twist, branchColor, leafColor, rules }
}

// ---- Render (show final) ----
function hideSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar')
    const btn = document.getElementById('sidebar-toggle')
    sidebar.classList.add('hidden')
    btn.textContent = '☰'
    updateMobileAnimVisibility()
  }
}

window.render = function () {
  stopAnimation()
  hideSidebarOnMobile()
  const { axiom, angle, iterations, len, twist, branchColor, leafColor, rules } = getParams()

  const t0 = performance.now()
  const taggedGens = generateAllGenerationsTagged(axiom, rules, iterations)
  cachedGenerations = taggedGens.map(g => g.chars)
  cachedGeometries = preRenderAllGenerations(taggedGens, angle, len, twist, branchColor, leafColor)
  const t1 = performance.now()

  const lastData = cachedGeometries[cachedGeometries.length - 1]
  if (!lastData) {
    document.getElementById('stats').textContent = `⚠️ Too complex. Try fewer iterations.`
    return
  }

  currentGenIndex = cachedGenerations.length - 1
  showGeometry(lastData, currentGenIndex, cachedGenerations.length)
  if (autoFrame) centerCamera(lastData)

  const segments = lastData.vertices.length / 6
  updateUI(currentGenIndex, cachedGenerations.length, segments, `Precomputed in ${(t1 - t0).toFixed(0)}ms`)

  // Show animation section
  document.getElementById('anim-section').style.display = ''
  const slider = document.getElementById('gen-slider')
  slider.max = cachedGenerations.length - 1
  slider.value = currentGenIndex
  document.getElementById('gen-label').textContent = `${currentGenIndex} / ${cachedGenerations.length - 1}`
}

// ---- Playback Controls ----
function stopAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer)
    animationTimer = null
  }
  drawProgress = null
  isPlaying = false
  const btn = document.getElementById('play-btn')
  if (btn) btn.textContent = '▶'
}

window.togglePlay = function () {
  hideSidebarOnMobile()
  if (!cachedGeometries) { render(); return }

  if (isPlaying) {
    stopAnimation()
    return
  }

  isPlaying = true
  document.getElementById('play-btn').textContent = '⏸'

  // Start from 0 if at the end
  if (currentGenIndex >= cachedGenerations.length - 1) {
    currentGenIndex = 0
  }

  // Center camera on final generation so it doesn't jump around
  if (autoFrame) centerCamera(cachedGeometries[cachedGeometries.length - 1])

  // Start the growth animation for current generation
  startGrowthForGen(currentGenIndex)
}

function startGrowthForGen(genIndex) {
  const data = cachedGeometries[genIndex]
  if (!data) { stopAnimation(); return }

  const totalVerts = data.vertices.length / 3
  const totalSegments = totalVerts / 2

  if (!growthMode) {
    // Instant mode — show immediately, then advance
    showGeometry(data, genIndex, cachedGenerations.length)
    if (autoFrame) centerCamera(data)
    updateUI(genIndex, cachedGenerations.length, totalSegments)
    currentGenIndex = genIndex

    if (isPlaying && genIndex < cachedGenerations.length - 1) {
      animationTimer = setTimeout(() => {
        if (isPlaying) startGrowthForGen(genIndex + 1)
      }, 800)
    } else if (genIndex >= cachedGenerations.length - 1) {
      stopAnimation()
    }
    return
  }

  // Growth mode — progressive draw
  const duration = Math.min(2500, Math.max(600, totalSegments * 0.8))

  if (currentMesh) {
    scene.remove(currentMesh)
    currentMesh.geometry.dispose()
    currentMesh.material.dispose()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
  geometry.setDrawRange(0, 0)

  const material = new THREE.LineBasicMaterial({ vertexColors: true })
  currentMesh = new THREE.LineSegments(geometry, material)
  scene.add(currentMesh)

  if (autoFrame) centerCamera(data)
  updateUI(genIndex, cachedGenerations.length, totalSegments, 'Growing...')

  drawProgress = {
    startTime: performance.now(),
    duration,
    genIndex,
    totalVerts,
    totalSegments
  }
}

window.setGrowthMode = function (enabled) {
  growthMode = enabled
}

window.setAutoFrame = function (enabled) {
  autoFrame = enabled
}

window.scrubGeneration = function (val) {
  if (!cachedGeometries) return
  stopAnimation()
  currentGenIndex = parseInt(val)
  const data = cachedGeometries[currentGenIndex]
  if (!data) return
  showGeometry(data, currentGenIndex, cachedGenerations.length)
  const segments = data.vertices.length / 6
  updateUI(currentGenIndex, cachedGenerations.length, segments)
}

// ---- Animation Loop ----
function animate() {
  requestAnimationFrame(animate)

  // Handle growth animation — progressive draw following turtle path
  if (drawProgress && currentMesh) {
    const { startTime, duration, genIndex, totalVerts, totalSegments } = drawProgress
    const elapsed = performance.now() - startTime
    const t = Math.min(1, elapsed / duration)
    // Ease out quad — fast start, gentle finish
    const eased = 1 - Math.pow(1 - t, 2)

    const vertCount = Math.floor(eased * totalVerts)
    // Must be even for LineSegments (2 verts per segment)
    const evenCount = vertCount - (vertCount % 2)
    currentMesh.geometry.setDrawRange(0, evenCount)

    if (t >= 1) {
      currentMesh.geometry.setDrawRange(0, totalVerts)
      updateUI(genIndex, cachedGenerations.length, totalSegments)
      drawProgress = null
      currentGenIndex = genIndex

      if (isPlaying && genIndex < cachedGenerations.length - 1) {
        setTimeout(() => {
          if (isPlaying) startGrowthForGen(genIndex + 1)
        }, 400)
      } else if (genIndex >= cachedGenerations.length - 1) {
        stopAnimation()
      }
    }
  }

  controls.update()
  renderer.render(scene, camera)
}
animate()

// ---- Resize ----
window.addEventListener('resize', () => {
  const w = container.clientWidth
  const h = container.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
})

// ---- Mobile Sidebar Toggle ----
function updateMobileAnimVisibility() {
  if (window.innerWidth > 768) return
  const sidebar = document.getElementById('sidebar')
  const anim = document.getElementById('anim-section')
  if (!anim) return
  // Hide playback when sidebar is open on mobile
  if (sidebar.classList.contains('hidden')) {
    anim.style.removeProperty('display')
  } else {
    anim.style.display = 'none'
  }
}

window.toggleSidebar = function () {
  const sidebar = document.getElementById('sidebar')
  const btn = document.getElementById('sidebar-toggle')
  sidebar.classList.toggle('hidden')
  const isHidden = sidebar.classList.contains('hidden')
  btn.textContent = isHidden ? '☰' : '✕'
  updateMobileAnimVisibility()
}

// ---- Collapsible Sections ----
window.toggleSection = function (id) {
  const header = document.getElementById(`${id}-header`)
  const content = document.getElementById(`${id}-content`)
  header.classList.toggle('collapsed')
  content.classList.toggle('collapsed')
}

// ---- User Presets (localStorage) ----
const USER_PRESETS_KEY = 'lsystem-lab-user-presets'

function getUserPresets() {
  try { return JSON.parse(localStorage.getItem(USER_PRESETS_KEY)) || {} }
  catch { return {} }
}

function saveUserPresets(presets) {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets))
}

function renderUserPresets() {
  const presets = getUserPresets()
  const names = Object.keys(presets)
  const container = document.getElementById('user-presets')
  container.innerHTML = ''
  for (const name of names) {
    const btn = document.createElement('div')
    btn.className = 'preset user-preset'
    btn.textContent = name
    btn.onclick = (e) => {
      if (e.target.classList.contains('delete-preset')) return
      loadUserPreset(name)
    }
    const del = document.createElement('button')
    del.className = 'delete-preset'
    del.textContent = '×'
    del.onclick = (e) => {
      e.stopPropagation()
      const p = getUserPresets()
      delete p[name]
      saveUserPresets(p)
      renderUserPresets()
    }
    btn.appendChild(del)
    container.appendChild(btn)
  }
}

function loadUserPreset(name) {
  const p = getUserPresets()[name]
  if (!p) return
  document.getElementById('axiom').value = p.axiom
  document.getElementById('angle').value = p.angle
  document.getElementById('iterations').value = p.iterations
  document.getElementById('length').value = p.length
  document.getElementById('twist').value = p.twist
  branchPickr.setColor(p.branchColor)
  document.getElementById('branchColor-hex').textContent = p.branchColor
  leafPickr.setColor(p.leafColor)
  document.getElementById('leafColor-hex').textContent = p.leafColor

  const rulesDiv = document.getElementById('rules')
  rulesDiv.innerHTML = ''
  for (const [key, val] of Object.entries(p.rules)) {
    addRuleRow(key, val)
  }
  render()
}

window.saveUserPreset = function () {
  const input = document.getElementById('save-preset-name')
  const name = input.value.trim()
  if (!name) { input.focus(); return }
  const params = getParams()
  const presets = getUserPresets()
  presets[name.trim()] = {
    axiom: params.axiom,
    rules: params.rules,
    angle: params.angle,
    iterations: params.iterations,
    length: params.len,
    twist: params.twist,
    branchColor: params.branchColor,
    leafColor: params.leafColor
  }
  saveUserPresets(presets)
  renderUserPresets()
  input.value = ''
}

renderUserPresets()

// Load default preset
loadPreset('3D Tree')
