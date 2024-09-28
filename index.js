import postgres from 'postgres'
import pkg from 'pg';
const { Client } = pkg;
import supabase from './supabase.js';
import schedule from 'node-schedule';
const connectionString = process.env.POSTGRES_URL
const sql=postgres(connectionString)
let newContestName = 'weekly-contest-414';
let url = 'https://leetcode.cn/contest/api/ranking/weekly-contest-414';
const base_url = `https://leetcode.cn/contest/api/ranking/`;
let lastSaturdayRun = null;

//URL Obtaining
async function fetchAndProcessContest() {
    try {
        // Step 1: Fetch contests data from the API
        const response = await fetch('https://leetcode.cn/contest/api/list/');
        const data = await response.json();

        // Step 2: Extract the 3rd contest's title_slug
        const thirdContestSlug = data.contests[2]?.title_slug;
        if (!thirdContestSlug) {
            console.error('Third contest not found');
            return;
        }

        // Step 3: Replace '-' with '_' in the title_slug
        const modifiedContestName = thirdContestSlug.replace(/-/g, '_');
        console.log(`Modified contest name: ${modifiedContestName}`);

        // Check if the contest already exists in the database
        const { data: tableExists, error: tableCheckError } = await supabase
            .from('contests')
            .select('contest_name')
            .eq('contest_name', modifiedContestName);

        if (tableCheckError) {
            console.error('Error checking table existence:', tableCheckError);
            return;
        }

        if (tableExists && tableExists.length > 0) {
            console.log(`Table '${modifiedContestName}' already exists.`);
            newContestName = modifiedContestName;
            return;
        }

        newContestName = modifiedContestName;
        url = `${base_url}${newContestName.replace(/_/g, '-')}`; // Update the URL for fetching contest data
        await createNewTable(newContestName); // Ensure the table is created

    } catch (error) {
        console.error('Error fetching or processing contest data:', error);
    }
}

// Function to create a new table with the given name
async function createNewTable(newTableName) {
    const createTableSQL = `
        CREATE TABLE ${newTableName} (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            create_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            leetcode_id VARCHAR(50),
            rank INT,
            finish_time VARCHAR(50) DEFAULT '0:0:0',
            no_of_questions INTEGER DEFAULT NULL,
            question_ids text[] DEFAULT NULL,
            status VARCHAR(50) DEFAULT NULL,
            dept VARCHAR(50) DEFAULT NULL,
            section VARCHAR(50) DEFAULT 'A',
            year VARCHAR(50) DEFAULT NULL,
            college VARCHAR(50) DEFAULT NULL
        );
    `;

    const client = new Client({
        connectionString: process.env.POSTGRES_URL,
    });

    try {
        await client.connect();
        await client.query(createTableSQL);
        console.log(`Table ${newTableName} created successfully.`);
    } catch (err) {
        console.error('Error creating new table:', err);
    } finally {
        await client.end();
    }
}


//UserCount obtaining
let userCount = 0;
let totalPages = 0;
const pageSize = 25;
const maxRetries = 3;
async function usercnt(){
    const response = await fetch(`${url}?pagination=1`);
    const cntdata = await response.json();
    userCount = cntdata.user_num;
    totalPages = Math.ceil(userCount / pageSize);
    console.log(`User Count: ${userCount}\nTotal Pages: ${totalPages}`)
}


//Data fetching
async function fetchData(pageIndex, attempt = 1) {
    try {
        console.log(`Started fetching data for page ${pageIndex}`);
        const response = await fetch(`${url}?pagination=${pageIndex}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Completed fetching data for page ${pageIndex}`);
        return data;
    } catch (error) {
        console.error(`Error fetching data for page ${pageIndex}:`, error);
        if (attempt < maxRetries) {
            console.log(`Retrying page ${pageIndex} (attempt ${attempt + 1})...`);
            return fetchData(pageIndex, attempt + 1); // Retry fetching
        } else {
            console.error(`Failed to fetch page ${pageIndex} after ${maxRetries} attempts.`);
            return null; // Return null after max retries
        }
    }
}


//Transfering to supabase
let userDataTable = "user_data";
let userData = false;
async function transferToSupabase() {
    console.log(`Fetching url: ${url}`)
    let unfetchedPages = [];
    userData = newContestName.includes('biweekly_contest');
    if(userData == true){
        userDataTable = "user_data_copy"
    }
    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
        const data = await fetchData(pageIndex);
        if (data) {
            const combinedData = data.submissions.map((submission, index) => ({
                username: data.total_rank[index].username,
                rank: data.total_rank[index].rank,
                finish_time: convertTime(data.total_rank[index].finish_time),
                no_of_questions: Object.keys(submission).length,
                question_ids: Object.keys(submission).map(key => submission[key].question_id),
            }));

            const { error } = await supabase
                .from(userDataTable)
                .insert(combinedData);

            if (error) {
                console.error('Error inserting data into Supabase:', error.message);
                unfetchedPages.push(pageIndex); // Store unfetched page index
            } else {
                console.log('Inserted records into Supabase');
            }
        } else {
            unfetchedPages.push(pageIndex); // Store unfetched page index
        }

        // Add a delay of 10 seconds after every 10 pages
        if (pageIndex % 10 === 0 && pageIndex < totalPages) {
            console.log('Waiting for 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    // Retry unfetched pages
    if (unfetchedPages.length > 0) {
        console.log(`Retrying unfetched pages: ${unfetchedPages.join(', ')}`);
        for (let pageIndex of unfetchedPages) {
            const data = await fetchData(pageIndex);
            if (data) {
                const combinedData = data.submissions.map((submission, index) => ({
                    username: data.total_rank[index].username,
                    rank: data.total_rank[index].rank,
                    finish_time: convertTime(data.total_rank[index].finish_time),
                    no_of_questions: Object.keys(submission).length,
                    question_ids: Object.keys(submission).map(key => submission[key].question_id),
                }));

                const { error } = await supabase
                    .from(userDataTable)
                    .insert(combinedData);

                if (error) {
                    console.error(`Error inserting data for page ${pageIndex} into Supabase:`, error.message);
                } else {
                    console.log(`Inserted records for page ${pageIndex} into Supabase`);
                }
            } else {
                console.error(`Failed to fetch and insert data for page ${pageIndex}.`);
            }

            // Add a delay of 10 seconds before retrying next page
            console.log('Waiting for 10 seconds before retrying next page...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    } else {
        console.log('All pages fetched and processed successfully.');
    }
}


//TimeStamp Converting
const convertTime = (epochTimestamp) => {
    const date = new Date(epochTimestamp * 1000);
    const dayOfWeek = date.getDay();
    const startTime = dayOfWeek === 6 ? 20 : 8; 
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const Readablehours = hours.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const Readableminutes = minutes.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const Readableseconds = seconds.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    return `${parseInt(Readablehours) - startTime}:${Readableminutes}:${Readableseconds}`;
};
    

//Inserting data
async function insertContestData() {
    try {
        const { data: allUsers, error: fetchError } = await supabase
            .from('students')
            .select('leetcode_id, student_name,dept,year,section,college');

        if (fetchError) {
            console.error('Error fetching all users:', fetchError.message);
            return;
        }

        const { data: attendedUsers, error: matchError } = await supabase
            .from('user_data')
            .select('username, rank, no_of_questions, question_ids,finish_time')
            .in('username', allUsers.map(user => user.leetcode_id));

        if (matchError) {
            console.error('Error fetching attended users:', matchError.message);
            return;
        }

        const difficulties = await getQuestionDifficulties();
        const difficultyOrder = ['Easy', 'Medium', 'Hard'];

        // Prepare data for insertion
        const attendedData = attendedUsers.map(user => {
            const student = allUsers.find(u => u.leetcode_id === user.username);
            const questionDiff = user.question_ids.map(q => difficulties[q]);
            questionDiff.sort((a, b) => difficultyOrder.indexOf(a) - difficultyOrder.indexOf(b));

            return {
                leetcode_id: user.username,
                username: student.student_name, // Use student_name or fallback to username if not found
                rank: user.rank,
                finish_time: user.finish_time,
                no_of_questions: user.no_of_questions,
                question_ids: questionDiff ,
                status: 'attended',
                dept: student.dept,
                year: student.year,
                section: student.section,
                college: student.college
            };
        });

        const attendedIds = attendedUsers.map(user => user.username);
        const notAttendedData = allUsers
            .filter(user => !attendedIds.includes(user.leetcode_id))
            .map(user => ({
                leetcode_id: user.leetcode_id,
                username: user.student_name,  // Use student_name from students table
                rank: null,
                finish_time: null,
                no_of_questions: null,
                question_ids: null,
                status: 'not attended',
                dept: user.dept,
                year: user.year,
                section: user.section,
                college: user.college
            }));

        // Combine attended and not attended data
        const combinedData = [...attendedData, ...notAttendedData];

        // Filter out any entries with null username before insertion
        const filteredData = combinedData.filter(entry => entry.username !== null);
             const { error } = await supabase
            .from(newContestName.replace(/-/g, '_'))
            .insert(filteredData);

        if (error) {
            console.error('Error inserting data into', newContestName, ':', error);
        } else {
            console.log('Data successfully inserted into', newContestName);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}


//Updating Difficulties 
const getQuestionDifficulties=async()=>{
    console.log(url)
    const questions=await fetchData(1).then((res)=>res.questions)
    const questionCredits = await questions.map((q, index) => ({
        question_id: q.question_id,
        credit: q.credit // Assuming the index corresponds to the credit; adjust if there's actual credit data
    }));
    questionCredits.sort((a,b)=>a.credit - b.credit)
    
    const difficulties = {};
        if (questionCredits.length === 4) {
            // For the middle two questions
            for (let i = 0; i <= 3; i++) {
                if(questionCredits[i].credit<=3) difficulties[questionCredits[i].question_id] = 'Easy'
                else if(questionCredits[i].credit<=5) difficulties[questionCredits[i].question_id] = 'Medium'
                else difficulties[questionCredits[i].question_id] = 'Hard'
            }
        }
    console.log(difficulties)
    return difficulties
}


//Inserting ContestName
// Insert the new contest into the database
async function InsertContestName() {
    const { error } = await supabase
            .from('contests')
            .insert([{ contest_name: newContestName.replace(/-/g, '_') }]);

        if (error) {
            console.error('Error inserting contest name:', insertError);
            return;
        }

        console.log(`Contest '${newContestName}' inserted successfully.`);
}


//Truncating table
async function truncateUserDataTable() {
    const client = new Client({
        connectionString: process.env.POSTGRES_URL,
    });

    try {
        await client.connect();
        await client.query(`TRUNCATE TABLE ${userDataTable} RESTART IDENTITY CASCADE`);
        console.log(`${userDataTable} table truncated successfully.`);
    } catch (err) {
        console.error(`Error truncating ${userDataTable} table:`, err.message);
    } finally {
        await client.end();
    }
}


// Calling functions
// Function to handle the alternate Saturday job
async function runOnAlternateSaturday() {
    const currentISTDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    try {
        if (!lastSaturdayRun) {
            lastSaturdayRun = currentISTDate;
            await fetchAndProcessContest();
            await truncateUserDataTable();
            await transferToSupabase();
            await insertContestData();
            await InsertContestName();
        } else {
            const diffInDays = (currentISTDate - lastSaturdayRun) / (1000 * 60 * 60 * 24);
            if (diffInDays >= 14) {
                lastSaturdayRun = currentISTDate;
                await fetchAndProcessContest();
                await usercnt();
                await truncateUserDataTable();
                await transferToSupabase();
                await insertContestData();
                await InsertContestName();
            }
        }
    } catch (error) {
        console.error('Error running alternate Saturday tasks:', error.message);
    }
}

// Function to handle the Sunday job
async function runOnSunday() {
    try {
        await fetchAndProcessContest();
        await usercnt();
        await truncateUserDataTable();
        await transferToSupabase();
        await insertContestData();
        await InsertContestName();
    } catch (error) {
        console.error('Error running Sunday tasks:', error.message);
    }
}

// Schedule job for Sundays at 10 AM IST
schedule.scheduleJob('30 10 * * 0', async () => {
    try {
        await runOnSunday();
    } catch (err) {
        console.error('Error running scheduled Sunday job:', err.message);
    }
});

// Schedule job for alternate Saturdays at 10 PM IST
schedule.scheduleJob('0 22 * * 6', async () => {
    try {
        await runOnAlternateSaturday();
    } catch (err) {
        console.error('Error running scheduled alternate Saturday job:', err.message);
    }
});
