// Connect to Azure Functions
const { app } = require("@azure/functions");

// Connect to Database
const { getConnection, sql } = require("../../database");

// Used for Password hashing
const bcrypt = require("bcrypt");

// Imports JWT
const jwt = require("jsonwebtoken");

app.http("Account", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",

    handler: async (request) => {

        try {

            // Connect to the database
            const connection = await getConnection();

            //verify JWT token
            const token = request.headers.get("x-auth-token");

            // If no token is provided, return a 401 error
            if (!token) {
                return {
                    status: 401,
                    jsonBody: {
                        message: "Authentication token missing."
                    }
                };
            }

            // Verify the token and decode it to get the user ID
            let decoded;

            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            }

            // If the token is invalid, return a 401 error
            catch (error) {
                return {
                    status: 401,
                    jsonBody: {
                        message: error.message
                    }
                };
            }

            // Get the logged-in user's ID
            const userID = decoded.userID;

            // Handle GET request to load account info
            if (request.method === "GET") {

                // Query the database for the user's account info
                const result = await connection.request()
                    .input("userID", sql.Int, userID)
                    .query(`
                        SELECT
                            UserID AS userID,
                            Email AS email,
                            CreatedDate AS createdDate
                        FROM Users
                        WHERE UserID = @userID
                    `);

                // If no user is found, return a 404 error
                if (result.recordset.length === 0) {
                    return {
                        status: 404,
                        jsonBody: {
                            message: "User not found."
                        }
                    };
                }

                return {
                    status: 200,
                    jsonBody: result.recordset[0]
                };
            }
            // Handle POST request to change password or email
            if (request.method === "POST") {

                // Read JSON body
                const body = await request.json();

                // if the body contains a new email, handle the email change
                if (body.newEmail) {

                    // Destructure the body to get the current password and new email
                    const { currentPassword, newEmail } = body;

                    // Make sure fields are filled
                    if (!currentPassword || !newEmail) {
                        return {
                            status: 400,
                            jsonBody: {
                                message: "Please fill out all fields."
                            }
                        };
                    }

                    // Find the user's current password
                    const result = await connection.request()
                        .input("userID", sql.Int, userID)
                        .query(`
                            SELECT Password
                            FROM Users
                            WHERE UserID = @userID
                        `);

                    // If no user is found, return a 404 error
                    if (result.recordset.length === 0) {
                        return {
                            status: 404,
                            jsonBody: {
                                message: "User not found."
                            }
                        };
                    }

                    // Compare current password to the hashed password in the database
                    const passwordMatches = await bcrypt.compare(
                        currentPassword,
                        result.recordset[0].Password
                    );

                    // If the current password does not match, return a 401 error
                    if (!passwordMatches) {
                        return {
                            status: 401,
                            jsonBody: {
                                message: "Current password is incorrect."
                            }
                        };
                    }

                    // Make sure no other account is already using this email
                    const emailCheck = await connection.request()
                        .input("newEmail", sql.VarChar, newEmail)
                        .input("userID", sql.Int, userID)
                        .query(`
                            SELECT UserID
                            FROM Users
                            WHERE Email = @newEmail AND UserID != @userID
                        `);
                        
                    // If the email is already in use, return a 409 error
                    if (emailCheck.recordset.length > 0) {
                        return {
                            status: 409,
                            jsonBody: {
                                message: "That email is already in use."
                            }
                        };
                    }

                    // Save the new email
                    await connection.request()
                        .input("userID", sql.Int, userID)
                        .input("newEmail", sql.VarChar, newEmail)
                        .query(`
                            UPDATE Users
                            SET Email = @newEmail
                            WHERE UserID = @userID
                        `);

                    // Return a success message if the email was changed successfully
                    return {
                        status: 200,
                        jsonBody: {
                            message: "Email changed successfully."
                        }
                    };
                }

                // if the body contains a new password, handle the password change
                if (body.newPassword) {

                    // Destructure the body to get the current password and new password
                    const 
                    {
                        currentPassword,
                        newPassword
                    } = body;

                    // Make sure fields are filled
                    if (!currentPassword || !newPassword) 
                    {
                        return {
                            status: 400,
                            jsonBody: {
                                message: "Please fill out all fields."
                            }
                        };
                    }

                    // Find the user's current password
                    const result = await connection.request()
                        .input("userID", sql.Int, userID)
                        .query(`
                            SELECT Password
                            FROM Users
                            WHERE UserID = @userID
                        `);

                    // If no user is found, return a 404 error
                    if (result.recordset.length === 0) 
                    {
                        return {
                            status: 404,
                            jsonBody: {
                                message: "User not found."
                            }
                        };
                    }

                    // Compare current password to the hashed password in the database
                    const passwordMatches = await bcrypt.compare(
                    currentPassword,
                    result.recordset[0].Password
                    );

                    // If the current password does not match, return a 401 error
                    if (!passwordMatches) 
                    {
                        return {
                            status: 401,
                            jsonBody: {
                                message: "Current password is incorrect."
                            }
                        };
                    };
                

                    // Hash the new password
                    const hashedPassword = await bcrypt.hash(newPassword, 10);

                    // Save the new password
                    await connection.request()
                        .input("userID", sql.Int, userID)
                        .input("password", sql.VarChar, hashedPassword)
                        .query(`
                            UPDATE Users
                            SET Password = @password
                            WHERE UserID = @userID
                        `);
                    
                    // Return a success message if the password was changed successfully
                    return {
                        status: 200,
                        jsonBody: {
                            message: "Password changed successfully."
                        }
                    };
                }

                // if the body does not contain a new email or new password, return a 400 error
                return {
                    status: 400,
                    jsonBody: {
                        message: "Request must include either newEmail or newPassword."
                    }
                };

            }

            // Invalid method
            return {
                status: 405,
                jsonBody: {
                    message: "Method not allowed."
                }
            };

        }
        // Catch any unexpected errors
        catch (error) {
            
            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    message: "Server error."
                }
            };

        }

    }

});