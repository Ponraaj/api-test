    import supabase from './supabase.js';
    let url_copy = `https://leetcode.cn/contest/api/ranking/weekly_contest_411`;
    let url = `https://leetcode.cn/contest/api/ranking/`;
    let lastSaturdayRun = null;
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
                return;
            }

            // Step 5: Insert the contest name into the 'contests' table
            const { data: insertData, error: insertError } = await supabase
                .from('contests')
                .insert([{ contest_name: modifiedContestName }]);

            if (insertError) {
                console.error('Error inserting contest name:', insertError);
                return;
            }
            console.log(`Contest '${modifiedContestName}' inserted successfully.`);
            return modifiedContestName;
            

            
        } catch (error) {
            console.error('Error fetching or processing contest data:', error);
        }
    }

    async function runOnSundayAndAlternateSaturday() {
        const currentDate = new Date();
        
        // Convert current date to IST (Indian Standard Time)
        const options = { timeZone: 'Asia/Kolkata', hour12: false };
        const currentISTDate = new Date(currentDate.toLocaleString('en-US', options));
        
        const dayOfWeek = currentISTDate.getDay(); // Sunday is 0, Saturday is 6
        const hours = currentISTDate.getHours(); // Get the hour in 24-hour format
        
        // Run at 10 AM or 10 PM IST
        if (hours === 10 || hours === 22) {
            // Run on Sunday
            if (dayOfWeek === 0) {
                url = `https://leetcode.cn/contest/api/ranking/`;
                url+= await fetchAndProcessContest();
            }
    
            // Run on alternate Saturday
            if (dayOfWeek === 6) {
                if (!lastSaturdayRun) {
                    lastSaturdayRun = currentISTDate;
                    url+= await fetchAndProcessContest();
                } else {
                    const diffInDays = (currentISTDate - lastSaturdayRun) / (1000 * 60 * 60 * 24);
                    if (diffInDays >= 14) {
                        lastSaturdayRun = currentISTDate;
                        url = `https://leetcode.cn/contest/api/ranking/`;
                        url+= await fetchAndProcessContest();
                    }
                }
            }
        }
    }
    
    // Check every minute to see if it's 10 AM or 10 PM IST
    setInterval(runOnSundayAndAlternateSaturday, 60 * 1000);
    runOnSundayAndAlternateSaturday();
    
    const pageSize = 25;
    const maxRetries = 3;
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
    let userCount = 0;
    async function usercnt(){
        const response = await fetch(`${url}?pagination=1`);
        const cntdata = await response.json();
        userCount = cntdata.user_num;
    }
    if(url_copy != url){
        usercnt();
    }
    const totalPages = Math.ceil(userCount / pageSize);
    async function transferToSupabase() {
        let unfetchedPages = [];
        for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
            const data = await fetchData(pageIndex);
            userCount = data.user_num;
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
            url_copy = url;
        }
    }



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
        
    // transferToSupabase().then(()=>{
    //     console.log("Transfer to supabase complete")
    // }).catch(err=>{
    //     console.log(err)
    // })
    // insertContestData()

    
    // Initial run when the script starts
    