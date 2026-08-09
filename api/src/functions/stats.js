const { app } = require("@azure/functions");
const { getConnection, sql } = require("../../database");

// maps the 3-letter codes to their full names
const quizTypeLabels = {
    multiple: "Multiple Choice",
    MCQ: "Multiple Choice",
    TFS: "True/False",
    FIB: "Fill in the Blank",
    FLC: "Flashcard",
    SHR: "Short Answer"
};

app.http("Stats", {
    methods: ["GET"],
    authLevel: "anonymous",

    handler: async (request, context) => {

        try {
            // grab year/month from the query string, default to the current month
            const now = new Date();
            const year = Number(request.query.get("year")) || now.getFullYear();
            const month = Number(request.query.get("month")) || (now.getMonth() + 1);
            
            // connect to the database
            const pool = await getConnection();

            // how many quizzes of each type were made this month
            const typeResult = await pool.request()
                //input year and month
                .input("year", sql.Int, year)
                .input("month", sql.Int, month)

                // query the database for quiz counts by type for the specified year and month
                .query(`
                    SELECT QuizTypeID, COUNT(*) AS quizCount
                    FROM Quiz
                    WHERE YEAR(CreatedDate) = @year AND MONTH(CreatedDate) = @month
                    GROUP BY QuizTypeID
                `);

            // calculate the total number of quizzes made this month
            const totalQuizzes = typeResult.recordset.reduce((sum, row) => sum + row.quizCount, 0);

            //breakdown of quizzes by type
            const quizTypeBreakdown = typeResult.recordset.map((row) => ({
                // use the label from the mapping, or fallback to the QuizTypeID if not found
                label: quizTypeLabels[row.QuizTypeID] || row.QuizTypeID,
                // count of quizzes of this type
                count: row.quizCount,
                // percentage of quizzes of this type compared to the total
                percentage: totalQuizzes > 0
                    ? Math.round((row.quizCount / totalQuizzes) * 100)
                    : 0
            }));

            // how many different users were active this month
            // active means they adaded or took a quiz or added a planner event
            const activeResult = await pool.request()
                .input("year", sql.Int, year)
                .input("month", sql.Int, month)

                // query the database for the count of distinct active users for the specified year and month
                // that created a quiz, took a quiz, or added a planner event
                .query(`
                    SELECT COUNT(DISTINCT UserID) AS activeUsers
                    FROM (
                        SELECT UserID
                        FROM Quiz
                        WHERE YEAR(CreatedDate) = @year AND MONTH(CreatedDate) = @month

                        UNION

                        SELECT UserID
                        FROM QuizResults
                        WHERE YEAR(TakenAt) = @year AND MONTH(TakenAt) = @month

                        UNION

                        SELECT P.UserID
                        FROM PlannerActivity PA
                        JOIN Planner P ON PA.PlannerID = P.PlannerID
                        WHERE YEAR(PA.CreatedDate) = @year AND MONTH(PA.CreatedDate) = @month
                    ) AS activity
                `);
            
            // return the stats as a JSON response
            return {
                status: 200,
                jsonBody: {
                    year,
                    month,
                    quizTypeBreakdown,
                    totalQuizzes,
                    activeUsers: activeResult.recordset[0].activeUsers
                }
            };

        // catch any errors that occur during the process and log them, returning a 500 status code with an error message
        } catch (error) 
        {
            context.log("Stats failed:", error.message);

            return {
                status: 500,
                jsonBody: { error: "Failed to load stats." }
            };
        }
    }
});