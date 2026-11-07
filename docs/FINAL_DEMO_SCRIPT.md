# ORBIT ZERO: THE LAST DOWNLINK: Demo Script (about 2:45)

Every number below comes from the shipped Fireline mission and was reproduced in automated emulated-WebXR runs. The game is a fictional simulation. Say so in the first sentence.

## 0. Opening line (0:00 - 0:15)
"ORBIT ZERO is a simulated emergency-response game, not a real satellite system. You sit in a small orbital console, and in each pass you decide which evidence reaches the ground before the link closes."

## 1. The problem (0:15 - 0:35)
- Wildfires, floods and earthquakes cut ground networks. Earth-observation satellites can help, but one pass has limited power, onboard storage and downlink time.
- The game turns that trade-off into hand-sized decisions. Cite the real physics only as far as the game uses it: optical cannot see through dense smoke or cloud, thermal infrared can see heat through smoke, radar can see through cloud.

## 2. Fireline setup (0:35 - 0:55)
- Show the briefing panel: three ground requests for the Bolan canyon fire. Canyon fire front (Sector B), viaduct firebreak (Sector C), ridge depot (Sector E).
- State the budget: 52 Wh of power, 10.0 s downlink window at 10 MB/s.

## 3. Hands-first scanning (0:55 - 1:20)
- Hands only. Point at a sector, pinch the sensor pad to choose Thermal IR, trigger the scan. A data cube appears in the tray.
- Say what each choice costs: Thermal 11 Wh and 42 MB, Optical 8 Wh and 40 MB.

## 4. Inspect and process (1:20 - 1:50)
- Pick up a cube and hold it to read its evidence label (confirmed, probable or unverified) and the stated uncertainty.
- Drop it in the Processing Cradle. Onboard feature extraction shrinks the packet (about 40 MB to 18 MB) for 6 Wh. It saves link time and does not add information that was never observed.

## 5. The wrong-sensor moment (1:50 - 2:05)
- Show the Sector E scan with Optical: the cube is unverified because smoke blocks visible light. Say this is the mistake the game teaches.

## 6. Commit the downlink (2:05 - 2:25)
- Place compressed cubes in the downlink bay slots. The HUD shows the committed time against the 10.0 s window.
- The reference optimal plan: Thermal for B and E (compressed), Optical for C, 76 MB sent in 7.6 s, 10 Wh left.
- Press the commit pad.

## 7. Honest debrief (2:25 - 2:45)
- Success: each request shows VERIFIED, with the ground consequence and a "Your decision" line naming the sensor that was strongest.
- Failure or partial: show the plain-language retry guidance ("Wrong sensor for the conditions" or "Not everything fit in the downlink window") and the score ceiling. A result is never explained by evidence that did not reach Earth.

## What makes it different
It is a decision game about evidence, cost and honesty. A dashboard shows data; here the player chooses what the data is worth sending.

## Do not say
- That any number is a real satellite capability, a real rescue prediction or live imagery.
- That it has been tested on a Meta Quest. State plainly: "Hands-only play is verified in emulated WebXR on a desktop. Physical Quest validation is pending."

## Fallback if immersive XR is unavailable
1. Use "Play on Desktop" from the landing page. Same mission, mouse drag for cubes, full debrief.
2. If the page does not load, play the recorded run captured beforehand from the same build.
3. Keep the debrief screenshots (`artifacts/virtual-quest/visual/desktop-release2/`) as the last resort, and label them as emulator captures.
