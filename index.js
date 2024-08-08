import { writeFile,readFile } from 'fs/promises';

const url = 'https://leetcode.cn/contest/api/ranking/weekly-contest-409/';
const userCount = 36174;
const pageSize = 25;
const totalPages =  100
// Math.ceil(userCount / pageSize)

async function fetchData(pageIndex) {
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
        return null;
    }
}

async function startFetching() {
    const allSubmissions = [];
    const allRanks = [];

    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
        const data = await fetchData(pageIndex);
        if (data) {
            allSubmissions.push(...data.submissions);
            allRanks.push(...data.total_rank);
        }
        if(pageIndex%10==0) await new Promise(resolve => setTimeout(resolve, 10*1000)); // 10 seconds delay between requests
    }

    try {
        await writeFile('submissions.json', JSON.stringify(allSubmissions, null, 2));
        await writeFile('ranks.json', JSON.stringify(allRanks, null, 2));
        console.log('All data has been written to submissions.json and ranks.json');
    } catch (error) {
        console.error('Error writing data to file:', error);
    }
}

startFetching();

// const username = 'Anand--Singh'


// //Rank->username 
// const readRankFile=async()=>{
//     try {
        
//         const ranksData = await readFile('ranks.json', 'utf8');

//         const ranks = JSON.parse(ranksData);

        
        
//         return ranks
//     } catch (error) {
//         console.error('Error reading file:', error);
//     }
// }

// const readSubmissionFile=async()=>{
//     try {
        
//         const submissionData = await readFile('submissions.json', 'utf8');

//         const submissions = JSON.parse(submissionData);

        
        
//         return submissions
//     } catch (error) {
//         console.error('Error reading file:', error);
//     }

// }
// const ranks = await readRankFile()
// const submissions = await readSubmissionFile()

// const findUserAndSubmission = (username) => {
//     let userSubmission = null;

//     for (let i = 0; i < ranks.length; i++) {
//         if (ranks[i].username === username) {
//             userSubmission = submissions[i];
//             console.log('User:', ranks[i]);
//             console.log('User Submission:', userSubmission);
//             return { user: ranks[i], userSubmission };
//         }
//     }

//     console.log('User not found');
//     return null;
// };

// const user = findUserAndSubmission(username)
// console.log(user)