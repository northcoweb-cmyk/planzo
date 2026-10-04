# ECHO — Virtual Club (V2)

A live nightclub crowd for your second monitor. Keep DJing in Serato DJ Lite on one screen; ECHO runs
fullscreen on the other and turns into a dark house-music club full of people who react to your set —
bouncing on the kick, hands up in builds, phones out and a room-wide explosion on the drop.

ECHO **does not replace Serato** and **cannot read Serato or Spotify internals** (neither exposes a live
audio/data API). It listens to the *sound* — see [Connecting your music](#connecting-your-music).

```
npm install
npm run dev        # http://localhost:5173  (Chrome or Edge recommended)
npm run build      # production bundle in dist/  (npm run preview to serve it)
```

## Using it

1. Open the app, pick a **venue** and an **audio input**, press **START CLUB** (it goes fullscreen).
2. Drag the window to your left monitor if it isn't there already (press **F** to toggle fullscreen).
3. DJ. The UI fades to almost nothing; move the mouse to bring it back.

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `Space` | pause / resume the visual simulation | | `F` | fullscreen |
| `T` | tap the beat | | `H` | hide / show all UI |
| `B` | trigger a build | | `S` | settings |
| `D` | trigger a drop | | `A` | audio debug panel |
| `↑` / `↓` | crowd energy + / − | | `` ` `` or `G` | debug overlay |
| `C` / `V` | calm / hype the crowd for ~25 s | | `1`–`5` | switch venue |

## Connecting your music

ECHO analyses audio (Web Audio API): RMS, bass/mid/high bands, spectral flux, adaptive-threshold beat
detection, inter-onset-interval BPM estimation, and a structure detector (breakdown / build / drop with
cool-downs and recent-drop memory). Pick one input:

| Input | What it does | Notes |
|---|---|---|
| **System audio** | Captures what your computer is playing (`getDisplayMedia`). | Chrome/Edge on **Windows**: choose *Entire screen* and tick *Also share system audio*. Follows the Windows default output, so if Serato plays to the controller's own sound device, make that the default output or use a virtual cable. **macOS only shares tab audio** → use *Line in* with BlackHole/Loopback. Firefox/Safari can't share system audio. |
| **Line in / virtual cable** | Any audio input device (sound card line-in, VB-Cable, BlackHole, Loopback…). | Raw, unprocessed capture; never played back (no feedback). |
| **DJ controller (MIDI)** | Reads the Party Mix 2 over Web MIDI (read-only). Faders/crossfader set how loud the room is, **bass EQ kill = breakdown, bass back = drop**, pads/buttons make the crowd cheer. Map controls once with *Learn* in Settings → Audio; tempo via Tap (`T`) or the BPM setting. | Chrome/Edge only. On Windows, if Serato already holds the controller the browser may receive nothing — the monitor shows this; use System audio or a virtual cable instead. |
| **Microphone** | Hears your speakers. | Works anywhere; least precise. |
| **Demo set** | Built-in synthesised 124 BPM house track with builds and drops. | Real audio through the real pipeline — good for testing without any gear. |
| **Audio file** | Plays + analyses a local file. | |
| **Manual** | No capture. Tap tempo, set BPM, trigger builds/drops, energy slider. | Always available; used automatically if capture fails or the source ends. |

**DJ controller as a layer.** *Read my DJ controller* (on by default) runs next to any audio input. Run *Settings → Audio → Quick setup* once: move the crossfader, both channel faders and both bass knobs when asked (*Full setup* adds jogs, EQ, filter, play/cue/sync, pads and optional tap/build/drop buttons). Then the on-screen board mirrors the real controller, working the crossfader/filter/EQ hypes the crowd, pads cheer, and a silent mixer (faders down / nothing playing) keeps the room quiet even if the mic hears noise.

**Silence is silence.** The mic is noise-gated on its raw level (Settings → Audio → *Noise gate*, *Calibrate to my room* with the music off). With no music the crowd idles, the board is still, BPM shows "—" and the HUD says WAITING FOR MUSIC. The beat clock learns the beat grid from all detected hits, so arms and lights stay on the beat even when single kicks are missed; *Beat sync offset* nudges it by ±150 ms.

**Backup headset mic.** Tick *Headset mic as backup* (launcher or Settings → Audio) to run a second listener beside any main input. If the main input hears nothing it takes over (HUD shows BACKUP MIC); with the DJ controller it also supplies the tempo/beat, and covers the controller if Serato has locked it.

If something isn't supported ECHO says so in the UI, keeps running, and offers the next-best input.

## Architecture

```
src/
  main.ts                 composition root + frame loop
  core/                   Settings (localStorage), Quality presets, PerformanceManager, DebugManager, types
  audio/                  AudioEngine (inputs) · AudioAnalyzer (DSP) · BeatDetector · DemoSynth
  engine/                 EnergyEngine · StructureDetector · CrowdStateMachine · BeatClock · SessionManager
  crowd/                  CrowdManager (behaviour) · CrowdRenderer (GPU) · CrowdMaterial (shader skeleton)
                          characters.ts (10 slots) · CharacterGeometry (procedural placeholders) · GlbCharacter
  scene/                  SceneManager (renderer + post) · EnvironmentManager · LightingManager · Haze · LedWall
                          DJBooth · CameraRig · architecture/ (modular parts) · venues/ (5 venue presets)
  assets/                 AssetRegistry (GLB override slots)
  ui/                     launcher, HUD, settings drawer, audio-debug panel
public/assets/            drop-in folders for real models (see public/assets/README.md)
```

**Simulation is separate from visuals.** `EnergyEngine` produces a `CrowdFrame`
(`crowdEnergy`, `beatStrength`, `bassEnergy`, `highFrequencyEnergy`, `buildIntensity`, `dropIntensity`,
`rhythmIntensity`, `crowdDensity`, `reactionProbability`, `lightingIntensity` …). `CrowdManager`,
`LightingManager`, `LedWall`, `Haze` and `CameraRig` only read that frame.

**Crowd.** ~10 character slots, hundreds of people. Each person has randomised traits (reaction delay,
intensity, style, hands/jump/phone/clap/point probabilities, phase). Poses are streamed to the GPU as four
`vec4` instance attributes and a small procedural skeleton runs in the vertex shader — one `InstancedMesh`
per (character × LOD), 3 LOD levels, a few dozen draw calls total. Reaction probabilities live in
`src/crowd/reactions.ts`. Macro mood is a state machine
`CALM → GROOVE → ENERGY_BUILD → HYPE → DROP → PEAK → RECOVERY` (+ `BREAKDOWN`) using thresholds,
hysteresis and minimum dwell times; energy is slew-limited so it never jumps from 20 to 100.

**Lighting.** Modes `CALM · HOUSE · PEAK · DROP · BREAKDOWN · AFTERHOURS` × motion patterns, changed on
16-beat phrase boundaries; strobes are rate-limited (< 3 Hz) and can be disabled with *Reduce flashing*.

**Quality presets** (LOW → ULTRA) control crowd cap, resolution, bloom, real lights, beams, lasers and
haze. The first launch picks a preset from the GPU; *Auto-adjust* lowers resolution and then the preset if
the frame rate drops.

## Replacing placeholders with real assets

Everything is behind slots; no engine changes are needed. See `public/assets/README.md`.
* **Characters**: GLB with named rig parts → `crowd/GlbCharacter.ts` (convention documented there), listed in
  `public/assets/manifest.json` under `"characters"`.
* **Fixtures / props / booth parts**: any GLB slot via `assets/AssetRegistry.ts` (`"models"` in the manifest).

## Diagnostics

Append `?log=1&norender=1` to run the audio/structure pipeline without rendering and print detected beats,
BPM, builds and drops from `window.__echo.debug.log`. `?dtmax=0.3` lifts the simulation step clamp for slow
machines.

`test/dsp.html` feeds synthetic room noise → a 124 BPM track → noise through the real analyser/beat/energy code and reports gating and beat-grid accuracy; `test/glb-roundtrip.html` (served by `npm run dev` at `/test/glb-roundtrip.html`) exports a small named rig to GLB,
re-imports it and runs it through the character converter — a quick check that the GLB path still works.
