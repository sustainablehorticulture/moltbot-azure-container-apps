const fs = require('fs');
const path = require('path');
const axios = require('axios');

const registry = require('./courses.json');

class CourseTeacher {
    constructor({ apiKey, model } = {}) {
        this.apiKey = apiKey || process.env.OPENROUTER_API_KEY;
        this.model = model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
        this.sessions = new Map(); // userId -> session state
        this.contentCache = new Map(); // filename -> markdown text
        this.basePath = process.env.COURSE_CONTENT_PATH || registry.contentBasePath;
    }

    // ── Content loading ────────────────────────────────────────────────────

    loadMarkdown(filename) {
        if (this.contentCache.has(filename)) return this.contentCache.get(filename);
        try {
            const full = path.join(this.basePath, filename);
            const text = fs.readFileSync(full, 'utf-8');
            this.contentCache.set(filename, text);
            return text;
        } catch {
            return null;
        }
    }

    buildCourseContext(course) {
        const parts = [];
        const primary = this.loadMarkdown(course.sourceFile);
        if (primary) parts.push(`# ${course.sourceFile}\n\n${primary}`);
        for (const f of course.supplementFiles || []) {
            const sup = this.loadMarkdown(f);
            if (sup) parts.push(`# ${f}\n\n${sup}`);
        }
        return parts.join('\n\n---\n\n').slice(0, 12000); // keep within token budget
    }

    // ── Course listing ─────────────────────────────────────────────────────

    listCourses(category = null) {
        const courses = registry.courses.filter(c => !category || c.category === category);
        return courses.map(c => ({
            id: c.id, title: c.title, tagline: c.tagline,
            level: c.level, duration: c.duration,
            price: c.price ?? null, category: c.category, tags: c.tags
        }));
    }

    getCourse(courseId) {
        return registry.courses.find(c => c.id === courseId) || null;
    }

    // ── Session management ─────────────────────────────────────────────────

    startSession(userId, courseId, background = 'beginner') {
        const course = this.getCourse(courseId);
        if (!course) throw new Error(`Course '${courseId}' not found`);

        const profile = registry.studentProfiles[background] || registry.studentProfiles.beginner;
        const session = {
            courseId, background, profile,
            moduleIndex: 0,
            questionIndex: 0,
            questionsAsked: [],
            score: 0,
            startedAt: new Date().toISOString()
        };
        this.sessions.set(userId, session);
        return { course, profile, session };
    }

    getSession(userId) {
        return this.sessions.get(userId) || null;
    }

    endSession(userId) {
        const session = this.sessions.get(userId);
        this.sessions.delete(userId);
        return session;
    }

    // ── Question generation ────────────────────────────────────────────────

    async generateQuestion(userId) {
        const session = this.getSession(userId);
        if (!session) throw new Error('No active course session. Start one with POST /api/courses/session');

        const course = this.getCourse(session.courseId);
        const module = course.modules[session.moduleIndex] || course.modules[0];
        const profile = session.profile;
        const content = this.buildCourseContext(course);

        const systemPrompt = `You are Red Dog — a cheeky, loyal Aussie farm dog and expert teacher on the Agentic Ag platform.
You are currently teaching: "${course.title}" — Module: "${module.title}"
Student background: ${profile.label} — ${profile.description}

Your job: generate ONE engaging question for this student, perfectly calibrated to their background.
- For beginners and young learners: use simple language, analogies, multiple choice (A/B/C)
- For farmers: focus on practical outcomes and "what would you do" scenarios
- For technical students: include data, system architecture, or API questions
- For professionals: focus on business value, ROI, compliance, or market opportunity

Respond with valid JSON only:
{
  "question": "The question text",
  "type": "multiple_choice | open | scenario",
  "options": ["A. ...", "B. ...", "C. ..."] (only for multiple_choice),
  "correctAnswer": "The correct answer or option letter",
  "hint": "A helpful hint if they're stuck",
  "voicePrompt": "A short, vivid intro sentence for a cartoon dog teacher to say before asking the question",
  "moduleTitle": "${module.title}",
  "coursePct": ${Math.round(((session.moduleIndex) / course.modules.length) * 100)}
}`;

        const userPrompt = `Course content:\n${content}\n\nGenerate a question for module "${module.title}", section "${module.section}".`;

        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
        }, {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
        });

        let q;
        try {
            q = JSON.parse(res.data.choices[0].message.content);
        } catch {
            const raw = res.data.choices[0].message.content;
            const match = raw.match(/\{[\s\S]*\}/);
            q = match ? JSON.parse(match[0]) : { question: raw, type: 'open', hint: '', voicePrompt: '' };
        }

        session.questionsAsked.push({ module: module.id, question: q.question, answeredAt: null });
        session.questionIndex++;
        return q;
    }

    async evaluateAnswer(userId, answer) {
        const session = this.getSession(userId);
        if (!session) throw new Error('No active session');

        const course = this.getCourse(session.courseId);
        const module = course.modules[session.moduleIndex] || course.modules[0];
        const profile = session.profile;
        const content = this.buildCourseContext(course);
        const lastQ = session.questionsAsked.at(-1);

        const systemPrompt = `You are Red Dog, Aussie farm dog teacher. Evaluate a student's answer to this course question.
Course: "${course.title}" — Module: "${module.title}"
Student background: ${profile.label}

Be encouraging, practical, and concise. Use Red Dog's voice (cheeky but warm).
Respond with valid JSON only:
{
  "correct": true | false | "partial",
  "feedback": "Your feedback message in Red Dog voice",
  "explanation": "Brief explanation of the correct answer",
  "voicePrompt": "Short punchy line a cartoon dog teacher would say",
  "advanceModule": true | false
}`;

        const userPrompt = `Question: ${lastQ?.question}\nStudent answered: "${answer}"\nCourse content for context:\n${content.slice(0, 4000)}`;

        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
        }, {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
        });

        let result;
        try {
            result = JSON.parse(res.data.choices[0].message.content);
        } catch {
            result = { correct: 'partial', feedback: res.data.choices[0].message.content, advanceModule: false };
        }

        if (result.correct === true) session.score++;
        if (result.advanceModule && session.moduleIndex < course.modules.length - 1) {
            session.moduleIndex++;
            session.questionIndex = 0;
        }

        const lastQuestion = session.questionsAsked.at(-1);
        if (lastQuestion) lastQuestion.answeredAt = new Date().toISOString();

        return { ...result, progress: { module: session.moduleIndex, total: course.modules.length, score: session.score } };
    }

    // ── Teacher suggestions for human instructors ──────────────────────────

    async getTeacherPrompts(courseId, background = 'farmer', count = 5) {
        const course = this.getCourse(courseId);
        if (!course) throw new Error(`Course '${courseId}' not found`);

        const profile = registry.studentProfiles[background] || registry.studentProfiles.farmer;
        const content = this.buildCourseContext(course);

        const systemPrompt = `You are Red Dog, helping a human teacher run a session on "${course.title}".
The students are: ${profile.label} — ${profile.description}

Generate ${count} discussion questions and prompts a teacher can use in a classroom or field session.
Mix question types: ice-breakers, conceptual, practical, challenge, and reflection.
Respond with valid JSON: { "prompts": [{ "type": "...", "prompt": "...", "purpose": "..." }] }`;

        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Course content:\n${content.slice(0, 6000)}` }
            ],
            response_format: { type: 'json_object' }
        }, {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
        });

        try {
            return JSON.parse(res.data.choices[0].message.content);
        } catch {
            return { prompts: [] };
        }
    }
}

module.exports = CourseTeacher;
