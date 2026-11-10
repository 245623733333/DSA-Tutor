import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Minimal .env loader (no dependencies)
try {
  for (const l of (await readFile(join(root, '.env'), 'utf8')).split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const PORT = process.env.PORT || 3000;
const KEY = process.env.BHARATCODE_API_KEY;
const BASE = process.env.BHARATCODE_BASE_URL || 'https://bharatcode.ai/api/model/v1';
const MODEL = process.env.BHARATCODE_MODEL || 'qwen-3.8-27b';
const CPP_ON = process.env.ENABLE_CPP === '1';
const problems = JSON.parse(await readFile(join(root, 'problems.json'), 'utf8'));
const basePrompt = await readFile(join(root, 'prompts', 'tutor.md'), 'utf8');
const page = await readFile(join(root, 'public', 'index.html'));

const SPOKEN = ['English', 'Hindi', 'Telugu', 'Tamil', 'Bengali', 'Marathi', 'Kannada', 'Malayalam', 'Gujarati', 'Punjabi'];
const CODE = ['Python', 'Java', 'C++', 'JavaScript', 'C', 'Go'];

const LEVELS = {
  1: 'Hint ceiling: Level 1. Do not reveal the approach, the technique or any code. Help the student understand the problem and think it through, using a guiding question.',
  2: 'Hint ceiling: Level 2. Point toward the key insight with a question or nudge. Do not name the algorithm or data structure, and give no code.',
  3: 'Hint ceiling: Level 3. You may name the technique or data structure and explain why it fits. Do not give the full solution or complete code.',
  4: "Hint ceiling: Level 4. You may review the student's code in detail: point to bugs, edge cases and complexity. Do not rewrite their whole solution.",
  5: 'Hint ceiling: Level 5. You may give a full commented solution and explain it step by step.',
};

// ---------- C++ support: signatures, starters and reference solutions ----------
const CPP = {
  'two-sum': { sig: 'vector<int> twoSum(vector<int>& nums, int target)', args: ['vector<int>', 'int'], body: `    unordered_map<int, int> seen;
    for (int i = 0; i < (int)nums.size(); i++) {
        auto it = seen.find(target - nums[i]);
        if (it != seen.end()) return {it->second, i};
        seen[nums[i]] = i;
    }
    return {};` },
  'valid-parens': { sig: 'bool isValid(string s)', args: ['string'], body: `    stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else {
            if (st.empty()) return false;
            char o = st.top(); st.pop();
            if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
        }
    }
    return st.empty();` },
  'binary-search': { sig: 'int search(vector<int>& nums, int target)', args: ['vector<int>', 'int'], body: `    int lo = 0, hi = (int)nums.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) lo = mid + 1; else hi = mid - 1;
    }
    return -1;` },
  'max-subarray': { sig: 'int maxSubArray(vector<int>& nums)', args: ['vector<int>'], body: `    int cur = nums[0], best = nums[0];
    for (size_t i = 1; i < nums.size(); i++) {
        cur = max(nums[i], cur + nums[i]);
        best = max(best, cur);
    }
    return best;` },
  'anagrams': { sig: 'vector<vector<string>> groupAnagrams(vector<string>& strs)', args: ['vector<string>'], body: `    unordered_map<string, vector<string>> m;
    for (auto& s : strs) { string k = s; sort(k.begin(), k.end()); m[k].push_back(s); }
    vector<vector<string>> out;
    for (auto& kv : m) out.push_back(kv.second);
    return out;` },
  'islands': { sig: 'int numIslands(vector<vector<char>>& grid)', args: ['vector<vector<char>>'], body: `    int count = 0, R = grid.size(), C = R ? grid[0].size() : 0;
    function<void(int, int)> dfs = [&](int r, int c) {
        if (r < 0 || c < 0 || r >= R || c >= C || grid[r][c] != '1') return;
        grid[r][c] = '0';
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1);
    };
    for (int r = 0; r < R; r++)
        for (int c = 0; c < C; c++)
            if (grid[r][c] == '1') { count++; dfs(r, c); }
    return count;` },
  'first-unique': { sig: 'int firstUnique(vector<string>& skus)', args: ['vector<string>'], body: `    unordered_map<string, int> cnt;
    for (auto& s : skus) cnt[s]++;
    for (int i = 0; i < (int)skus.size(); i++)
        if (cnt[skus[i]] == 1) return i;
    return -1;` },
  'merge-slots': { sig: 'vector<vector<int>> mergeSlots(vector<vector<int>>& slots)', args: ['vector<vector<int>>'], body: `    sort(slots.begin(), slots.end());
    vector<vector<int>> out;
    for (auto& s : slots) {
        if (!out.empty() && s[0] <= out.back()[1]) out.back()[1] = max(out.back()[1], s[1]);
        else out.push_back(s);
    }
    return out;` },
};
const publicProblems = problems.map((p) => {
  const c = CPP[p.id];
  return c ? { ...p, cpp: { starter: `#include <bits/stdc++.h>\nusing namespace std;\n\n${c.sig} {\n    // your code here\n}\n`, sol: `#include <bits/stdc++.h>\nusing namespace std;\n\n${c.sig} {\n${c.body}\n}\n` } } : p;
});

const HEAD = '#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n#include <unordered_map>\n#include <unordered_set>\n#include <map>\n#include <set>\n#include <stack>\n#include <queue>\n#include <deque>\n#include <list>\n#include <array>\n#include <bitset>\n#include <tuple>\n#include <utility>\n#include <functional>\n#include <numeric>\n#include <sstream>\n#include <cmath>\n#include <climits>\n#include <cstring>\n#include <cstdlib>\n#include <cstdio>\nusing namespace std;\n#line 1\n';
const PRINT = String.raw`
static void P(bool v){cout<<(v?"true":"false");}
static void P(int v){cout<<v;}
static void P(long long v){cout<<v;}
static void P(const string& s){cout<<'"';for(char c:s){if(c=='"'||c=='\\')cout<<'\\';cout<<c;}cout<<'"';}
template<class T> static void P(const vector<T>& v){cout<<'[';for(size_t i=0;i<v.size();i++){if(i)cout<<',';P(v[i]);}cout<<']';}
`;
function lit(t, v) {
  const m = t.match(/^vector<(.+)>$/);
  if (m) return `${t}{${v.map((x) => lit(m[1], x)).join(',')}}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'char') return `'${v}'`;
  return String(v);
}
const exec = (cmd, args, ms, opts = {}) => new Promise((resolve) => {
  let out = '', err = '', done = false;
  const c = spawn(cmd, args, { ...opts, windowsHide: true });
  const fin = (r) => { if (done) return; done = true; clearTimeout(to); resolve({ out, err, ...r }); };
  const to = setTimeout(() => { c.kill('SIGKILL'); fin({ code: null, timedOut: true }); }, ms);
  c.stdout.on('data', (d) => { if (out.length < 200000) out += d; });
  c.stderr.on('data', (d) => { if (err.length < 8000) err += d; });
  c.on('error', (e) => fin({ code: -1, spawnError: e.code }));
  c.on('close', (code) => fin({ code }));
});
let compiling = 0;
async function runCpp(body) {
  if (!CPP_ON) return [403, { error: 'The C++ runner is off on this server. Run the project locally with g++ installed and ENABLE_CPP=1 to test C++ code.' }];
  const p = problems.find((x) => x.id === body.problemId), spec = p && CPP[p.id];
  if (!spec) return [400, { error: 'C++ is not available for this problem.' }];
  if (compiling >= 2) return [503, { error: 'The C++ runner is busy. Try again in a few seconds.' }];
  compiling++;
  const dir = await mkdtemp(join(tmpdir(), 'dsa-'));
  try {
    const src = join(dir, 'main.cpp'), exe = join(dir, process.platform === 'win32' ? 'main.exe' : 'main');
    let main = 'int main(){\n';
    p.tests.forEach((t, i) => {
      main += '{\n' + spec.args.map((ty, j) => `${ty} a${j} = ${lit(ty, t.args[j])};`).join('\n')
        + `\nauto r = ${p.fn}(${spec.args.map((_, j) => 'a' + j).join(',')});\ncout<<"T${i} ";P(r);cout<<endl;\n}\n`;
    });
    await writeFile(src, HEAD + String(body.code || '').slice(0, 20000) + '\n' + PRINT + main + 'return 0;}\n');
    const { BHARATCODE_API_KEY: _k, ...safeEnv } = process.env;
    const cc = await exec('g++', ['-std=c++17', '-O2', '-o', exe, src], 30000, { cwd: dir, env: safeEnv });
    if (cc.spawnError === 'ENOENT') return [200, { error: 'g++ was not found. Install a C++ compiler (build-essential on Linux, Xcode tools on Mac, MinGW-w64 on Windows) and restart.' }];
    if (cc.timedOut) return [200, { error: 'Compiling took too long.' }];
    if (cc.code !== 0) return [200, { compileError: cc.err.split(src).join('main.cpp').split('\n').slice(0, 25).join('\n') }];
    const run = await exec(exe, [], 3000, { cwd: dir, env: safeEnv });
    if (run.timedOut) return [200, { error: 'Timed out after 3 seconds. Check for an infinite loop.' }];
    const got = {};
    for (const l of run.out.split('\n')) {
      const m = l.match(/^T(\d+) (.*)$/);
      if (m) { try { got[m[1]] = JSON.parse(m[2]); } catch {} }
    }
    const crash = run.code ? `Crashed (exit code ${run.code}). Check array bounds and null access.` : 'No result for this test.';
    return [200, { out: p.tests.map((_, i) => (i in got ? { got: got[i] } : { err: crash })) }];
  } catch {
    return [500, { error: 'The C++ runner failed. Please try again.' }];
  } finally {
    compiling--;
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- shared helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const hits = new Map();
setInterval(() => hits.clear(), 600000).unref();
const limited = (ip) => {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < 60000);
  a.push(now);
  hits.set(ip, a);
  return a.length > 20;
};
async function readJson(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 60_000) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}

// ---------- AI tutor (streaming, with retries) ----------
function prepare(body) {
  if (!KEY) return { code: 500, error: 'Server is missing BHARATCODE_API_KEY.' };
  const p = problems.find((x) => x.id === body.problemId);
  if (!p) return { code: 400, error: 'Unknown problem.' };
  const level = Math.min(5, Math.max(1, parseInt(body.level) || 1));
  const lang = SPOKEN.includes(body.lang) ? body.lang : 'English';
  const codeLang = CODE.includes(body.codeLang) ? body.codeLang : 'Python';
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!history.length || history.at(-1).role !== 'user') return { code: 400, error: 'Send a message.' };
  const system = `${basePrompt}\n\nProblem: ${p.title} (${p.difficulty}, ${(p.topics || []).join(', ')})\n${p.statement}\n\n${LEVELS[level]}\n\nReply language: ${lang}. Keep code and technical terms in English.\nStudent's programming language: ${codeLang}.\n\nStudent's current code and latest test result:\n${String(body.code || '(none yet)').slice(0, 6000)}`;
  return { level, messages: [{ role: 'system', content: system }, ...history] };
}
const FRIENDLY = {
  401: 'BharatCode rejected the API key. Check BHARATCODE_API_KEY and that your access is active.',
  403: 'BharatCode rejected the API key. Check BHARATCODE_API_KEY and that your access is active.',
};
async function openUpstream(messages, level) {
  let stream = true;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try {
      r = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, stream, max_tokens: level === 5 ? 3000 : 1500, reasoning_effort: 'none' }),
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      if (attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
      throw new Error('Could not reach BharatCode. Please try again.');
    }
    if (r.status === 400 && stream) { stream = false; continue; }
    if ([429, 502, 503, 504].includes(r.status) && attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(FRIENDLY[r.status] || `BharatCode is busy or returned an error (${r.status}). Please try again.`);
    return r;
  }
  throw new Error('BharatCode is busy right now. Please try again in a moment.');
}
async function streamReply(res, messages, level) {
  let up;
  try { up = await openUpstream(messages, level); }
  catch (e) { return send(res, 502, { error: e.message }); }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  let wrote = 0, finish = '';
  const out = (t) => { if (t) { wrote += t.length; res.write(t); } };
  try {
    if ((up.headers.get('content-type') || '').includes('text/event-stream')) {
      const dec = new TextDecoder();
      let buf = '';
      for await (const chunk of up.body) {
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data:')) continue;
          const d = l.slice(5).trim();
          if (!d || d === '[DONE]') continue;
          try {
            const c = JSON.parse(d).choices?.[0];
            out(c?.delta?.content);
            if (c?.finish_reason) finish = c.finish_reason;
          } catch {}
        }
      }
    } else {
      const c = (await up.json()).choices?.[0];
      out(c?.message?.content);
      finish = c?.finish_reason || '';
    }
    if (finish === 'length') out('\n\n(…reply was cut short. Ask me to continue.)');
  } catch {
    out('\n\n(…connection interrupted. Please ask again.)');
  }
  if (!wrote) out('I did not get a reply this time. Please ask again.');
  res.end();
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url.split('?')[0] === '/') return send(res, 200, await readFile(join(root, 'public', 'index.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && req.url === '/api/problems') return send(res, 200, publicProblems);
    if (req.method === 'GET' && req.url === '/api/features') return send(res, 200, { cpp: CPP_ON });
    if (req.method === 'POST' && (req.url === '/api/tutor' || req.url === '/api/run-cpp')) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited(ip)) return send(res, 429, { error: 'Too many requests. Please wait a minute.' });
      const body = await readJson(req);
      if (req.url === '/api/run-cpp') { const [c, o] = await runCpp(body); return send(res, c, o); }
      const p = prepare(body);
      if (p.error) return send(res, p.code, { error: p.error });
      return await streamReply(res, p.messages, p.level);
    }
    send(res, 404, { error: 'Not found.' });
  } catch {
    if (!res.headersSent) send(res, 400, { error: 'Bad request.' });
    else res.end();
  }
}).listen(PORT, () => console.log(`DSA Tutor running at http://localhost:${PORT}  (C++ runner: ${CPP_ON ? 'ON' : 'off'})`));