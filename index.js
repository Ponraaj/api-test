import { writeFile,readFile } from 'fs/promises';
import supabase from './supabase.js';

const url = 'https://leetcode.cn/contest/api/ranking/weekly-contest-409/';
const userCount = 36174;
const pageSize = 25;
const totalPages = Math.ceil(userCount / pageSize)   
const maxRetries = 3
// Math.ceil(userCount / pageSize)

async function fetchData(pageIndex,attempt=1) {
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

async function transferToSupabase() {
    for (let pageIndex = 28; pageIndex <= totalPages; pageIndex++) {
        const data = await fetchData(pageIndex);
        if (data) {
                
            var questionsArray = data.questions;

            const combinedData = data.submissions.map((submission, index) => {
                return {
                    username: data.total_rank[index].username,
                    rank: data.total_rank[index].rank,
                    score: data.total_rank[index].score,
                    no_of_questions: questionsArray.length,
                    question_ids: questionsArray.map(q => q.question_id),
                };
            });

            const { data: insertedData, error } = await supabase
                .from('user_data')
                .insert(combinedData);

            if (error) {
                console.error('Error inserting data into Supabase:', error.message);
            } else {
                console.log('Inserted records into Supabase');
            }
        }

        // Add a delay of 10 seconds after every 10 pages
        if (pageIndex % 10 === 0 && pageIndex < totalPages) {
            console.log('Waiting for 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

// transferToSupabase();

// const username = 'FingNaresh'


// //Rank->username 
// const readRankFile=async()=>{
//     try {
        
//         const ranksData = await readFile('ranks.json', 'utf8');

//         const ranks = await JSON.parse(ranksData);

        
        
//         return ranks
//     } catch (error) {
//         console.error('Error reading file:', error);
//     }
// }

// const readSubmissionFile=async()=>{
//     try {
        
//         const submissionData = await readFile('submissions.json', 'utf8');

//         const submissions = await JSON.parse(submissionData);

        
        
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