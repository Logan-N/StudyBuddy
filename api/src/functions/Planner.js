const { app } = require("@azure/functions");
const { getConnection, sql } = require("../../database");
const jwt = require("jsonwebtoken");

app.http("Planner", {
  methods: ["POST","GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    try {
    const pool = await getConnection();

  // Get JWT token from request header
  const authHeader = request.headers.get("x-auth-token");
  console.log("Authorization Header:", authHeader);
  console.log("Secret exists:", !!process.env.JWT_SECRET);

  // If no token is provided, return a 401 error
    if (!authHeader) {
      return {
        status: 401,
        jsonBody: {
          message: "No authentication token was provided."
      }
    };
  }

// Remove "Bearer " from the token
const token = authHeader;
console.log("Token:", token);

// Verify the token and decode it to get the user ID
let decoded;

try {
  // Verify token is valid
  console.log("PLANNER SECRET LENGTH:", process.env.JWT_SECRET.length);
  console.log("PLANNER SECRET START:", process.env.JWT_SECRET.substring(0,5));  
  decoded = jwt.verify(token, process.env.JWT_SECRET);

} catch (error) {
    console.log("JWT ERROR:", error.message);
  return {
    status: 401,
    jsonBody: {
      message: error.message
    }
  };
}

// Get user ID from JWT
const userId = decoded.userID;

    // Load planner events
    if (request.method === "GET") {
        const result = await pool.request()
            .input("userId", sql.Int, userId)
            .query(`
                SELECT
                    PA.ActivityDate,
                    PA.ActivityType,
                    PA.ActivityTitle,
                    PA.Notes,
                    PA.StartTime,
                    PA.EndTime
                FROM Planner P
                JOIN PlannerActivity PA
                    ON P.PlannerID = PA.PlannerID
                WHERE P.UserID = @userId
                ORDER BY PA.ActivityDate
            `);
        return {
            status: 200,
            jsonBody: result.recordset
        };
    }
    
      const body = await request.json();
      const activityType=body.activityType;
      const activityDate = body.date;
      const activityTitle = body.title;
      // if notes are not provided, set them to "none"
      const notes = body.notes || "none"; // just to show there aren't any default notes
      // if start time or end time is not provided, set them to null
      const startTime = body.startTime || null;
      const endTime = body.endTime || null;
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
     // NEW: validate that end time isn't before start time
     if (startTime && endTime && endTime < startTime) {
        return {
          status: 400,
          jsonBody: {
            message: "End time cannot be before start time."
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
        .input("startTime", sql.VarChar(5), startTime)
        .input("endTime", sql.VarChar(5), endTime)
        .query(`
          INSERT INTO PlannerActivity (
            PlannerID,
            ActivityType,
            ActivityDate,
            ActivityTitle,
            Notes,
            StartTime,
            EndTime
          )
          VALUES (
            @plannerId,
            @activityType,
            @activityDate,
            @activityTitle,
            @notes,
            @startTime,
            @endTime
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
