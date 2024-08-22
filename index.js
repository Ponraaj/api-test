import supabase from './supabase.js';
const url = 'https://leetcode.cn/contest/api/ranking/weekly-contest-410/';
const userCount = 36160;
const pageSize = 25;
const totalPages = Math.ceil(userCount / pageSize)
const maxRetries = 3 
// Math.ceil(userCount / pageSize) 
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

async function transferToSupabase() {
    let unfetchedPages = [];
    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
        const data = await fetchData(pageIndex);
        if (data) {
            const combinedData = data.submissions.map((submission, index) => {
                return {
                    username: data.total_rank[index].username,
                    rank: data.total_rank[index].rank,
                    finish_time: convertTime(data.total_rank[index].finish_time),
                    no_of_questions: Object.keys(submission).length,
                    question_ids: Object.keys(submission).map(key => submission[key].question_id),
                };
            });

            const { data: insertedData, error } = await supabase
                .from('user_data')
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
                const combinedData = data.submissions.map((submission, index) => {
                    return {
                        username: data.total_rank[index].username,
                        rank: data.total_rank[index].rank,
                        finish_time: convertTime(data.total_rank[index].finish_time),
                        no_of_questions: Object.keys(submission).length,
                        question_ids: Object.keys(submission).map(key => submission[key].question_id),
                    };
                });

                const { data: insertedData, error } = await supabase
                    .from('user_data')
                    .insert(combinedData);

                if (error) {
                    console.error(`Error inserting data for page ${pageIndex} into Supabase:`, error.message);
                } else {
                    console.log(`Inserted records for page ${pageIndex} into Supabase`);
                }
            } else {
                console.error(`Failed to fetch and insert data for page ${pageIndex}.`);
            }

            // Add a delay of 10 seconds after retrying each page
            console.log('Waiting for 10 seconds before retrying next page...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    } else {
        console.log('All pages fetched and processed successfully.');
    }
}




const convertTime=(epochTimestamp)=>{

    const startTime = 8 //8 Am if weekly 8Pm i.e 20 if biWeekly

    const hours = new Date(epochTimestamp * 1000).getHours();
    const minutes = new Date(epochTimestamp * 1000).getMinutes();
    const seconds = new Date(epochTimestamp * 1000).getSeconds();  

    const Readablehours = hours.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const Readableminutes = minutes.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const Readableseconds = seconds.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }); 
    return `${parseInt(Readablehours)-startTime}:${Readableminutes}:${Readableseconds}`
}


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
        const difficulties = await getQuestionDifficulties()
        const difficultyOrder = ['Easy','Medium','Hard']
        // Prepare data for insertion
        const attendedData = attendedUsers.map(user => {
            // const submissionDifficulties = submission.question_ids.map((questionId) => {
            //     const questionIndex = sortedQuestions.findIndex(q => q.question_id === questionId);
            //     return difficultiesMap[questionIndex];
            // });
            // Find the corresponding student from the students table
            const student = allUsers.find(u => u.leetcode_id === user.username);
            const questionDiff = user.question_ids.map(q=>difficulties[q])
            questionDiff.sort((a,b)=>difficultyOrder.indexOf(a) - difficultyOrder.indexOf(b))
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
                collelge: student.college
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
                collelge: user.college
            }));

        // Combine attended and not attended data
        const combinedData = [...attendedData, ...notAttendedData];

        // Filter out any entries with null username before insertion
        const filteredData = combinedData.filter(entry => entry.username !== null);

        // Insert filtered data into the weekly_contest_409 table
        const { error: insertError } = await supabase
            .from('weekly_contest_410')
            .insert(filteredData);

        if (insertError) {
            console.error('Error inserting data into weekly_contest_410:', insertError.message);
        } else {
            console.log('Data successfully inserted into weekly_contest_410.');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example usage:   


const getQuestionDifficulties=async()=>{
const questions=await fetchData(1).then((res)=>res.questions)
const questionCredits = await questions.map((q, index) => ({
    question_id: q.question_id,
    credit: q.credit // Assuming the index corresponds to the credit; adjust if there's actual credit data
}));
questionCredits.sort((a,b)=>a.credit - b.credit)

const difficulties = {};
    if (questionCredits.length === 4) {
        difficulties[questionCredits[0].question_id] = 'Easy';
        difficulties[questionCredits[3].question_id] = 'Hard';

        // For the middle two questions
        for (let i = 1; i <= 2; i++) {
            difficulties[questionCredits[i].question_id] = questionCredits[i].credit < 6 ? 'Medium' : 'Hard';
        }
    }

return difficulties
}

// transferToSupabase().then(()=>{
//     console.log("Transfer to supabase complete")
// }).catch(err=>{
//     console.log(err)
// })
insertContestData()