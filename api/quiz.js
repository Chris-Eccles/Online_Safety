/**
 * POST /api/quiz
 * ============================================================================
 * Server-side quiz grading. The answer key (api/_data/quiz.json) never leaves
 * the server: the browser only ever receives question text and options, and
 * learns whether an answer was right AFTER submitting it.
 *
 * Quiz results and certificates are written only from here (via the
 * finish_quiz_attempt database function), never by the browser, so a student
 * cannot award themselves a pass or a certificate from devtools.
 *
 * Actions (JSON body):
 *   { action:'start',  moduleId, code, name, pinHash }            -> { attemptId, total, questions:[{id,q,opts}] }
 *   { action:'answer', attemptId, qid, choice, code, name, pinHash } -> { correct, correctIndex, explanation, finished?, score?, total?, passed?, certId? }
 *   { action:'cert',   code, name, pinHash }                       -> { certId }
 * Trial / demo (no student record): send practice:true instead of code/name/pinHash.
 * Practice attempts are graded the same way but never stored against a student.
 * ============================================================================
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientIp } = require('./_lib/rateLimit');
const QUIZ = require('./_data/quiz.json');

const PASS_RATIO = 0.7;
const QUESTIONS_PER_ATTEMPT = 7;
const MIN_SECONDS = 15; // a real attempt takes far longer than this

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch (e) { res.status(400).json({ error: 'Bad request' }); return; }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const action = String(body.action || '');
  const practice = body.practice === true;
  const code = String(body.code || '').trim().toUpperCase().slice(0, 40);
  const name = String(body.name || '').trim().slice(0, 120);
  const pinHash = String(body.pinHash || '').slice(0, 128);

  try {
    // Overall per-connection ceiling
    const ip = clientIp(req);
    const rlIp = await checkRateLimit(supabase, { bucket: 'quiz-ip:' + ip, limit: 240, windowSeconds: 600 });
    if (!rlIp.allowed) { res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' }); return; }

    // Identify the caller: a verified student, or an anonymous practice session.
    let nameKey = null;
    if (!practice) {
      if (!code || !name || !/^[a-f0-9]{64}$/.test(pinHash)) { res.status(400).json({ error: 'Missing sign-in details.' }); return; }
      const { data: ok, error: pinErr } = await supabase.rpc('check_student_pin', { p_code: code, p_name: name, p_hash: pinHash });
      if (pinErr) throw pinErr;
      if (!ok) { res.status(401).json({ error: 'auth' }); return; }
      nameKey = name.toLowerCase();
    }

    if (action === 'cert') {
      if (practice) { res.status(400).json({ error: 'Not available' }); return; }
      const { data } = await supabase.rpc('get_student_cert', { p_code: code, p_name: name });
      res.status(200).json({ certId: data || null });
      return;
    }

    if (action === 'start') {
      const moduleId = String(body.moduleId || '');
      const pool = QUIZ[moduleId];
      if (!pool) { res.status(400).json({ error: 'Unknown module' }); return; }

      if (!practice) {
        const rl = await checkRateLimit(supabase, { bucket: 'quiz-start:' + code + '|' + nameKey + '|' + moduleId, limit: 20, windowSeconds: 3600 });
        if (!rl.allowed) { res.status(429).json({ error: 'You have had a lot of attempts. Please wait a little while before trying again.' }); return; }
      }

      const picked = shuffle(pool).slice(0, Math.min(QUESTIONS_PER_ATTEMPT, pool.length));
      const { data: attempt, error } = await supabase.from('quiz_attempts').insert({
        license_code: practice ? null : code,
        name_key: practice ? null : nameKey,
        practice,
        module_id: moduleId,
        question_ids: picked.map(q => q.id)
      }).select('id').single();
      if (error) throw error;

      // Opportunistic tidy-up of abandoned practice attempts.
      if (practice && Math.random() < 0.05) {
        await supabase.from('quiz_attempts').delete().eq('practice', true).lt('created_at', new Date(Date.now() - 86400000).toISOString());
      }

      res.status(200).json({
        attemptId: attempt.id,
        total: picked.length,
        questions: picked.map(q => ({ id: q.id, q: q.q, opts: q.opts }))
      });
      return;
    }

    if (action === 'answer') {
      const attemptId = String(body.attemptId || '');
      const qid = String(body.qid || '');
      const choice = Number.isInteger(body.choice) ? body.choice : -1;
      if (!/^[0-9a-f-]{36}$/.test(attemptId)) { res.status(400).json({ error: 'Bad attempt' }); return; }

      const { data: attempt, error: aErr } = await supabase.from('quiz_attempts')
        .select('id, license_code, name_key, practice, module_id, question_ids, answers, finished_at')
        .eq('id', attemptId).maybeSingle();
      if (aErr) throw aErr;
      if (!attempt || attempt.finished_at) { res.status(409).json({ error: 'This quiz attempt has finished.' }); return; }
      // The attempt must belong to the caller.
      if (practice !== attempt.practice || (!practice && (attempt.license_code !== code || attempt.name_key !== nameKey))) {
        res.status(403).json({ error: 'Not your attempt.' }); return;
      }
      const q = (QUIZ[attempt.module_id] || []).find(x => x.id === qid);
      if (!q || !attempt.question_ids.includes(qid)) { res.status(400).json({ error: 'Unknown question' }); return; }
      if (choice < 0 || choice >= q.opts.length) { res.status(400).json({ error: 'Bad choice' }); return; }

      const { data: rec, error: rErr } = await supabase.rpc('record_quiz_answer', { p_attempt: attemptId, p_qid: qid, p_choice: choice });
      if (rErr) throw rErr;
      if (!rec || !rec.recorded) { res.status(409).json({ error: 'That question was already answered.' }); return; }

      const out = { correct: choice === q.correct, correctIndex: q.correct, explanation: q.explanation };

      if (rec.answered >= rec.total) {
        // Grade the whole attempt from the stored answers (never from anything the client claims).
        const { data: fin } = await supabase.from('quiz_attempts').select('answers, question_ids').eq('id', attemptId).single();
        let score = 0;
        for (const id of fin.question_ids) {
          const qq = QUIZ[attempt.module_id].find(x => x.id === id);
          if (qq && fin.answers[id] === qq.correct) score++;
        }
        const { data: result, error: fErr } = await supabase.rpc('finish_quiz_attempt', {
          p_attempt: attemptId, p_score: score, p_total: fin.question_ids.length, p_pass_ratio: PASS_RATIO, p_min_seconds: MIN_SECONDS
        });
        if (fErr) throw fErr;
        out.finished = true;
        out.score = score;
        out.total = fin.question_ids.length;
        out.passed = !!(result && result.passed);
        if (result && result.cert_id) out.certId = result.cert_id;
      }
      res.status(200).json(out);
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('quiz failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
