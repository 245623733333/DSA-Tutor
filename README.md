# DSA Tutor

DSA practice where you earn the answer. Pick a problem, write code, run real tests in your browser, and unlock hints one level at a time. Built for the BharatCode Build League (Learning & education).

## Features
- **Five-level hint ladder:** Understand, Nudge, Hint, Review, Solution. Works offline.
- **Test runner in the browser:** JavaScript and Python (Python loads via Pyodide, about 10 MB the first time).
- **Bug diagnostician:** plain-English nudges after a failing test (wrong order, off by one, missing return, infinite loop).
- **Speed check:** times your code on growing inputs and estimates whether it grows like O(n) or O(n²).
- **Voice hints:** hear any hint read aloud.
- **Desi problems:** UPI splits, Blinkit SKUs, railway platform slots.
- **Topic map and next-problem suggestion**, saved in your browser.
- **Challenge a friend:** share a WhatsApp link to a problem and beat each other's hint count.
- **Optional AI tutor** (English, Hindi, Telugu, Tamil) using the BharatCode API.
- **C++, Java and C practice mode:** hints and AI review, no test execution yet.

## Run it
Requires Node 18+.
```bash
cp .env.example .env     # add BHARATCODE_API_KEY (optional: only the AI tutor needs it)
npm start                # http://localhost:3000
```
Deploy on a Node host (Render, Railway, Fly.io) and set `BHARATCODE_API_KEY` as an environment variable. GitHub Pages cannot keep the key secret.

## Roadmap
Run C, C++, Java and Go tests through a self-hosted code-execution sandbox. Pointer and array visualiser. More problems.

## License
MIT