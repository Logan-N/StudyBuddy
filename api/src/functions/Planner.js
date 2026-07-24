const { app } = require("@azure/functions");
const { getConnection, sql } = require("../../database");

app.http("Planner", {
  methods: ["POST","GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
      // wait for connection
       const pool = await getConnection();
      //Get request check
       if (request.method === "GET") {
      try {
        //read user ID
        const userId = request.query.get("userId");

        const result = await pool.request()
          .input("userId", sql.Int, userId)
          .query(`
            SELECT pa.ActivityID, pa.ActivityType, pa.ActivityDate, pa.ActivityTitle, pa.Notes
            FROM PlannerActivity pa
            JOIN Planner p ON pa.PlannerID = p.PlannerID
            WHERE p.UserID = @userId
            ORDER BY pa.ActivityDate
          `);

        return {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.recordset)
        };
      } catch (error) {
        return {
          status: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Failed to load events: " + error.message })
        };
      }
    }
     
      const body = await request.json();
  const activityType=body.activityType;
      const userId = 1;
      const activityDate = body.date;
      const activityTitle = body.title;
      const notes = body.notes || "none"; // just to show there aren't any default notes
// if user id activity date or activity title is missing you return 400 error (which is basically a bad input  or missing field)
      if (!userId || !activityDate || !activityTitle) {
        return {
          status: 400,
              jsonBody: 
              {
                message: "Missing required fields"
              }
        };
      }
// look up planner using userID
      const plannerResult = await pool.request()
        .input("userId", sql.Int, userId)
        .query(`
          SELECT PlannerID
          FROM Planner
          WHERE UserID = @userId
        `);

      let plannerId;
// check if planner exists for the user, if not create a new planner and get the new planner ID
      if (plannerResult.recordset.length === 0) {
        const newPlanner = await pool.request()
          .input("userId", sql.Int, userId)
          .query(`
            INSERT INTO Planner (UserID)
            VALUES (@userId);
            SELECT SCOPE_IDENTITY() AS PlannerID;
          `);

        plannerId = newPlanner.recordset[0].PlannerID;
      } else {
        plannerId = plannerResult.recordset[0].PlannerID;
      }
//insert the activity into the PlannerActivity table
      await pool.request()
        .input("plannerId", sql.Int, plannerId)
        .input("activityType", sql.Char(3), activityType)
        .input("activityDate", sql.Date, activityDate)
        .input("activityTitle", sql.VarChar(30), activityTitle)
        .input("notes", sql.VarChar(sql.MAX), notes)
        .query(`
          INSERT INTO PlannerActivity (
            PlannerID,
            ActivityType,
            ActivityDate,
            ActivityTitle,
            Notes
          )
          VALUES (
            @plannerId,
            @activityType,
            @activityDate,
            @activityTitle,
            @notes
          )
        `);

      return {
        status: 200,
        jsonBody: 
        {
          message: "Planner event saved successfully."
        }
      };
    } catch (error) {
        // return a server error
      return {
        status: 500,
        jsonBody: 
        {
          message: "Planner save failed: " + error.message
        }
      };
    }
  }
});
