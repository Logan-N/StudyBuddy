const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("Quizzes", {
    methods: ["GET"],
    authLevel: "anonymous",

    handler: async (request) =>
    {
        try
        {
            // Extract the authentication token from the request headers
            const token = request.headers.get("x-auth-token");
            // Check if the token is provided
            if (!token)
            {
                return {
                    status: 401,
                    jsonBody: { error: "Authentication token missing." }
                };
            }
            // Verify the token and extract the user information
            let user;

            try
            {
                user = jwt.verify(token, process.env.JWT_SECRET);
            }
            catch
            {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired token." }
                };
            }
            // Extract the user ID from the verified token
            const connection = await getConnection();

            // Query the database to retrieve quiz for the authenticated user
            // Outer apply to get null if no score is available, so that the quiz is still returned
            const result = await connection.request()
                .input("userID", sql.Int, user.userID)
                .query(`
                    SELECT
                        q.QuizID,
                        q.Title,
                        q.Topic,
                        q.Difficulty,
                        q.QuizTypeID,
                        q.CreatedDate,
                        r.Score,
                        r.CorrectAnswers,
                        r.TotalQuestions,
                        r.TakenAt
                        FROM Quiz q
                        OUTER APPLY (
                    SELECT TOP 1 Score, CorrectAnswers, TotalQuestions, TakenAt
                    FROM QuizResults
                    WHERE QuizResults.QuizID = q.QuizID
                    ORDER BY TakenAt DESC
                    ) r
                    WHERE q.UserID = @userID
                     ORDER BY q.CreatedDate DESC
                `);

            // Return the retrieved quiz in the responses
            return {
                status: 200,
                jsonBody: {
                    quizzes: result.recordset
                }
            };
        }
        // Catch any errors that occur during the process
        catch (error)
        {
            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    error: "Failed to load quizzes."
                }
            };
        }
    }
});