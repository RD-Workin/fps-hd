# Audio (src/audio/) — status: core DONE, music stingers TODO
- 100% procedural Web Audio: no files, zero cost. Sounds synthesized at load (sounds.js, dsp.js) into AudioBuffers (~40 names, 1–8 variants each).
- Graph: buses sfx/ui/music -> master gain (volume*mute) -> compressor(-16dB,4:1) -> limiter -> out. sfx goes through `muffle` lowpass; convolver reverb (generated outdoor IR) via per-voice send.
- 32 pooled voices (12 2D, 20 3D HRTF panners); per-name instance cap + priority stealing; only BufferSource created per play.
- 3D: distance lowpass (20k*exp(-d/30), min 700 Hz) + occlusion (physics.lineOfSight -> LP 1.1 kHz, -5 dB). Listener follows ctx.camera each frame.
- Never throws: no AudioContext -> stub API still works (mute/volume persisted). Plays nothing until context is running (resumed on first pointerdown/keydown/click).
## API (ctx.audio)
- muted, volume (0..1), setMuted(b), toggleMute(), setVolume(v), update(dt), ready, ac
- play(name, {pos, gain, rate, delay, bus:'sfx'|'ui'|'music', send, lp, prio, max, occlude}) ; playUi('hover'|'click')
- Emits 'audio:muted' {muted}, 'audio:volume' {volume}. Key M toggles. localStorage keys nova.audio.muted / nova.audio.volume.
## Triggers
- weapon:fire -> rifle (+casing tinkle); weapon:dryfire or firePressed with mag 0 -> dryFire
- reload foley from weapon.reloadProgress: 0.10 magOut, 0.52 magIn, 0.78 charge
- weapon:hit -> hit tick / kill / headshot ding (ui bus) + flesh impact; actor:killed -> kill (if player killer), bot bodyFall
- player:damaged -> damage thud; health<30 -> heartbeat+breath + master muffle; player:died -> death hit + 500 Hz muffle until round:start
- player footsteps from moveSpeed/onGround (Shift walk silent, crouch quiet), jump, landing (vy<-4)
- bots: positional steps from position deltas (<32 m, speed>1.8), gunshots on lastShotTime change (rifleEnemy / rifleFar >40 m)
- ctx.effects.impact wrapped -> material impacts (+rare ricochet); ctx.effects.tracer wrapped -> whiz/crack if passes <2.5 m of camera
- bomb: game.useAction plant -> keypad beeps, defuse -> clicks; planted beep positional, interval 1/0.5/0.25/0.12 s; 10 s warning; arm tone at 1 s; explosion positional + sub layer + tinnitus/muffle if <20 m
- UI hover/click auto via delegation on button/[role=button]/.btn/[data-sfx]/input[type=range]/a
- Paused in-game: sfx muffled to 900 Hz.
## TODO (next owner)
- Musical stingers (round start/win/lose, match victory/defeat, planted alarm) currently placeholders (pitched uiClick/keypad); add synth motifs on 'music' bus (addSaw in dsp.js ready).
- Menu ambient pad + wind ambience loop (windLoop() exists in sounds.js, not wired).
- Bot plant/defuse positional sounds ('bomb:planting'/'bomb:defusing' events).
