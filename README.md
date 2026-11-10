# DSA Tutor

DSA practice where you earn the answer. Pick a problem, write code, run real tests in your browser, and unlock hints one level at a time. Built for the BharatCode Build League (Learning & education).

**Live demo:** ADD_YOUR_LINK_HERE

## Features
- **Five-level hint ladder:** Understand, Nudge, Hint, Review, Solution. Works without any API.
- **In-browser test runner:** JavaScript and Python (Python loads via Pyodide, about 10 MB the first time).
- **Bug diagnostician:** plain-English nudges after a failing test (misspelled names, wrong order, off by one, missing return, infinite loop).
- **Speed check:** times your code on growing inputs and estimates whether it grows like O(n) or O(n²).
- **AI tutor** built on the BharatCode API: streams replies, remembers the chat per problem, reads your latest code and test result, and answers in English, Hindi, Telugu or Tamil.
- **Voice hints**, a **topic progress map**, and **Challenge a friend** links for WhatsApp.
- **Desi problems:** UPI splits, Blinkit SKUs, railway platform slots.
- **C++:** real test running when you run the project locally with g++ and `ENABLE_CPP=1`. On a hosted demo it stays in practice mode. Java and C are practice mode (hints and AI review).

## Run it
Requires Node 18+.
```bash
cp .env.example .env     # add BHARATCODE_API_KEY (only the AI tutor needs it)
npm start                # http://localhost:3000
```
Deploy on a Node host (Render, Railway, Fly.io) and set `BHARATCODE_API_KEY` as an environment variable. GitHub Pages cannot keep the key secret. Do not enable `ENABLE_CPP` on a public host: compiling strangers' code needs a real sandbox.

## Roadmap
Sandboxed C, C++, Java and Go test running, a pointer and array visualiser, more problems.

## License
MIT
