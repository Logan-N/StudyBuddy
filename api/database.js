// Import the Microsoft SQL Server for Node.js
const sql = require("mssql");


// Config to connect to Azure SQL
const config = {

    // Azure SQL Server Address Env Variable
    server: process.env.SQL_SERVER,

    // Azure SQL Server Database Env Variable
    database: process.env.SQL_DATABASE,

    // Azure SQL Server User Account Env Variable
    user: process.env.SQL_USER,

    // Azure SQL Server User Account Password Env Variable
    password: process.env.SQL_PASSWORD,


    // Options that control how Node connects to SQL Server
    options: {
        // Encrypts Connection to Database
        encrypt: true,
        // Node JS verifies the certificate already
        trustServerCertificate: false
    },

    // Created a pool allows multiple requests to reuse database connections, as recommended by Azure
    pool: {
        // Maximum number of database connections allowed at once
        max: 10,
        // Minimum number of open connections
        min: 0,
        // How long an unused connection stays open before closing
        idleTimeoutMillis: 30000
    }
};


// Store of our database connection pool
let pool;


// Function to connect to the database
async function getConnection() {


    // Check if we already created a connection pool, reuses if one is already active
    if (!pool) {


        // Create a new connection pool using our config settings
        pool = await new sql.ConnectionPool(config).connect();
    }


    // Return the existing connection pool
    return pool;
}


// Export these so other files can use them
module.exports = {

    // Our Functions will call the following to connect
    // const { getConnection } = require("./database");
    getConnection,

    // Allows other files to use SQL data types:
    sql
};
