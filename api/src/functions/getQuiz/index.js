const { app } = require("@azure/functions");
const Anthropic = require("@anthropic-ai/sdk");
const { getConnection, sql } = require("../../SQL");

app.http("generateQuiz", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const { userID, title, topic, count, type, difficulty } = body;

      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const prompt = `Generate a quiz titled "${title}".
Topic: ${topic}
Number of questions: ${count}
Difficulty: ${difficulty}
Quiz Type: ${type}

Follow these rules depending on the quiz type:

1. multiple
   - Provide 4 options: A, B, C, D
   - Correct answer must be one of those letters

2. truefalse
   - Provide a statement
   - Answer must be true or false

3. fill
   - Provide a sentence with a blank (___)
   - Answer should be the missing word or phrase

4. flashcard
   - Provide a prompt
   - Answer should be the “back of the Flashcard”

5. short
   - Provide an open-ended question
   - Answer can be a short explanation

Return JSON ONLY in this format:

{
  "title": "...",
  "topic": "...",
  "difficulty": "...",
  "type": "...",
  "questions": [
    {
      "id": 1,
      "question": "...",
      "options": ["A","B","C","D"],   // only for multiple
      "answer": "..."
    }
  ]
}
`;

      const response = await client.responses.create({
        model: "claude-3.5",
        input: prompt,
      });

      const generatedQuiz = response.output_text || response.output?.[0]?.content?.[0]?.text;

      return {
        status: 200,
        body: {
          quiz: generatedQuiz,
        },
      };
    } catch (error) {
      context.log.error(error);
      return {
        status: 500,
        body: { error: error.message || "Quiz generation failed." },
      };
    }
  },
});
