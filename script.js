// Ensure pdfjsLib is available
if (typeof pdfjsLib === 'undefined') {
    console.error("pdf.js library is not loaded correctly.");
    // Potentially display an error to the user on the page
} else {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// Ensure mammoth is available
if (typeof mammoth === 'undefined') {
    console.error("mammoth.js library is not loaded correctly.");
    // Potentially display an error to the user on the page
}


document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded");

    // Element selectors
    const apiKeyInput = document.getElementById('apiKey');
    const resumeFileInput = document.getElementById('resumeFile');
    const parsedResumeJsonTextarea = document.getElementById('parsedResumeJson');
    const jobDescriptionTextarea = document.getElementById('jobDescription');
    const generateButton = document.getElementById('generateTailoredResumeAndCoverLetter');
    const finalResumeOutputDiv = document.getElementById('finalResumeOutput');
    const generatedCoverLetterTextarea = document.getElementById('generatedCoverLetter');
    const messageArea = document.getElementById('messageArea'); // For displaying messages/errors
    const clearAllButton = document.getElementById('clearAllButton');

    // --- Utility functions for messages and loading states ---
    function showMessage(text, type = 'info') {
        messageArea.innerHTML = `<div class="${type}-message">${text}</div>`;
    }

    function clearMessage() {
        messageArea.innerHTML = '';
    }

    function setLoadingState(isLoading) {
        generateButton.disabled = isLoading;
        resumeFileInput.disabled = isLoading;
        if (isLoading) {
            if (document.activeElement === generateButton) {
                 showMessage("Processing your request, please wait...", 'info');
            } else if (document.activeElement === resumeFileInput || (event && event.target === resumeFileInput)) {
                 showMessage("Processing file, please wait...", 'info');
            }
        } else {
            // Keep message if it's an error, otherwise clear it
            if (!messageArea.querySelector('.error-message')) {
                clearMessage();
            }
        }
    }

    // --- Clear All Button ---
    clearAllButton.addEventListener('click', () => {
        apiKeyInput.value = '';
        resumeFileInput.value = ''; // Clears the selected file
        parsedResumeJsonTextarea.value = '';
        jobDescriptionTextarea.value = '';
        finalResumeOutputDiv.innerHTML = '';
        generatedCoverLetterTextarea.value = '';
        clearMessage();
        showMessage("All fields cleared.", 'info');
        setTimeout(clearMessage, 3000); // Clear info message after 3 seconds
    });


    // --- Phase 1: Resume Parsing ---
    resumeFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        clearMessage();
        if (!file) {
            // No file selected, or selection was cancelled.
            // parsedResumeJsonTextarea.value = "No file selected.";
            return;
        }

        finalResumeOutputDiv.innerHTML = "";
        generatedCoverLetterTextarea.value = "";
        parsedResumeJsonTextarea.value = "";


        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showMessage("API Key is missing. Please enter your Google AI Studio API Key.", 'error');
            return;
        }

        setLoadingState(true);
        parsedResumeJsonTextarea.value = "Extracting text from file...";


        try {
            let rawText = '';
            if (file.type === "application/pdf") {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    rawText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
            } else if (file.name.endsWith(".docx")) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});
                rawText = result.value;
            } else {
                parsedResumeJsonTextarea.value = "Error: Unsupported file type. Please upload .pdf or .docx";
                return;
            }

            if (!rawText.trim()) {
                parsedResumeJsonTextarea.value = "Error: Could not extract text from file. The file might be empty or corrupted.";
                return;
            }

            // Construct the "Parser" Prompt
            const jsonSchema = {
                contactInfo: { name: "string", email: "string", phone: "string", linkedin: "string (optional)", github: "string (optional)", portfolio: "string (optional)" },
                summary: "string",
                experience: [{ jobTitle: "string", company: "string", location: "string (optional)", dates: "string (e.g., MM/YYYY - MM/YYYY or Present)", duties: ["string"] }],
                education: [{ institution: "string", degree: "string", graduationDate: "string (e.g., MM/YYYY or Expected MM/YYYY)", location: "string (optional)", details: "string (optional, e.g., GPA, honors)" }],
                skills: {
                    technical: ["string"],
                    soft: ["string"],
                    other: ["string (optional)"]
                },
                projects: [{ name: "string", description: "string", technologies: ["string"], link: "string (optional)"} (optional)],
                certifications: [{ name: "string", issuingOrganization: "string", date: "string (optional)"} (optional)],
                awards: [{ name: "string", organization: "string", date: "string (optional)"} (optional)]
            };

            const parserPrompt = `Analyze the following resume text and convert it into a JSON object with this exact structure: ${JSON.stringify(jsonSchema, null, 2)}. Ensure all string values are properly escaped. Here is the text: \n\n${rawText}`;


            // Call Gemini API (Phase 1)
            showMessage("Sending to AI for parsing...", 'info');
            parsedResumeJsonTextarea.value = "Sending to AI for parsing...";
            const parsedJson = await callGeminiAPI(apiKey, parserPrompt);
            parsedResumeJsonTextarea.value = parsedJson; // Display editable JSON
            showMessage("Resume parsed successfully. You can now edit the JSON if needed.", 'info');

        } catch (error) {
            console.error("Error during Phase 1 processing:", error);
            const userErrorMessage = `Error during file processing: ${error.message}. Check console for more details.`;
            parsedResumeJsonTextarea.value = userErrorMessage;
            showMessage(userErrorMessage, 'error');
            if (error.message.includes("API key not valid")) {
                 showMessage("The provided API key is not valid. Please check and try again.", 'error');
            }
        } finally {
            setLoadingState(false);
        }
    });

    // --- Phase 2: Tailoring and Cover Letter ---
    generateButton.addEventListener('click', async () => {
        clearMessage();
        const apiKey = apiKeyInput.value.trim();
        const resumeJsonString = parsedResumeJsonTextarea.value.trim();
        const jobDesc = jobDescriptionTextarea.value.trim();

        if (!apiKey) {
            showMessage("API Key is missing. Please enter it above.", 'error');
            return;
        }
        if (!resumeJsonString) {
            showMessage("Parsed Resume JSON is missing. Please upload a resume first.", 'error');
            return;
        }
        if (!jobDesc) {
            showMessage("Job Description is missing. Please paste it in the textarea.", 'error');
            return;
        }

        setLoadingState(true);
        finalResumeOutputDiv.innerHTML = ""; // Clear previous resume
        generatedCoverLetterTextarea.value = ""; // Clear previous C.L.
        showMessage("Generating tailored resume and cover letter...", 'info');


        try {
            // Validate JSON structure before sending
            let resumeJson;
            try {
                resumeJson = JSON.parse(resumeJsonString);
            } catch (e) {
                showMessage("The Parsed Resume JSON is not valid. Please correct it before proceeding.", 'error');
                setLoadingState(false);
                return;
            }

            // "Tailor" Prompt for Resume
            const tailorPrompt = `Act as a career coach. Rewrite the content of the following resume.json (especially "summary" and "experience" sections, and "duties" within experience) to align perfectly with the keywords and requirements of the provided job description. Return a JSON object with the *exact same structure* as the input resume.json. Do not add new top-level keys or change the existing schema. Ensure all string values are properly escaped. \n\nResume JSON:\n${JSON.stringify(resumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;

            const tailoredResumeJsonString = await callGeminiAPI(apiKey, tailorPrompt);
            let tailoredResumeJson;
            try {
                tailoredResumeJson = JSON.parse(tailoredResumeJsonString);
            } catch (e) {
                console.error("Error parsing tailored resume JSON from API:", e, "\nReceived:", tailoredResumeJsonString);
                const RerrorMsg = "Error: AI returned an invalid JSON format for the tailored resume. Check console for details.";
                showMessage(RerrorMsg, 'error');
                finalResumeOutputDiv.innerHTML = RerrorMsg;
                generatedCoverLetterTextarea.value = "Could not generate cover letter due to resume tailoring error.";
                setLoadingState(false);
                return;
            }

            renderHtmlResume(tailoredResumeJson, finalResumeOutputDiv); // Render the HTML resume
            showMessage("Tailored resume generated. Now generating cover letter...", 'info');

            // "Cover Letter" Prompt
            const coverLetterPrompt = `Generate a professional and customized cover letter based on the following tailored resume JSON and job description. The cover letter should be ready to send, filling in all placeholders. If critical information like the hiring manager's name or specific company address is missing and cannot be inferred, mention that such details might need to be added by the user. The tone should be enthusiastic and professional. Highlight key achievements and skills from the resume that match the job description. \n\nTailored Resume JSON:\n${JSON.stringify(tailoredResumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;

            // generatedCoverLetterTextarea.value = "Sending to AI for cover letter generation..."; // Message is already shown
            const coverLetterText = await callGeminiAPI(apiKey, coverLetterPrompt);
            generatedCoverLetterTextarea.value = coverLetterText;
            showMessage("Tailored resume and cover letter generated successfully!", 'info');


        } catch (error) {
            console.error("Error during Phase 2 processing:", error);
            const userErrorMessageP2 = `Error during tailoring/generation: ${error.message}. Check console for details.`;
            showMessage(userErrorMessageP2, 'error');
            finalResumeOutputDiv.innerHTML = `Error: ${error.message}`;
            generatedCoverLetterTextarea.value = `Error: ${error.message}`;
            if (error.message.includes("API key not valid")) {
                showMessage("The provided API key is not valid. Please check and try again.", 'error');
            }
        } finally {
            setLoadingState(false);
        }
    });

    // --- Gemini API Call Function ---
    async function callGeminiAPI(apiKey, promptText) {
        // IMPORTANT: Replace with the correct endpoint for the Gemini API model you are using.
        // This is a general structure. The exact model and API endpoint might differ.
        // For example, for generative-language API:
        const model = "gemini-pro"; // Or another appropriate model
        const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }],
                    // Optional: Add generationConfig if needed
                    // generationConfig: {
                    //   temperature: 0.7,
                    //   topK: 1,
                    //   topP: 1,
                    //   maxOutputTokens: 2048,
                    // },
                }),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                console.error("API Error Response:", errorBody);
                const errorDetail = errorBody.error?.message || `HTTP error! status: ${response.status}`;
                if (response.status === 400 && errorDetail.includes("API key not valid")) {
                     throw new Error("API key not valid. Please pass a valid API key.");
                }
                throw new Error(`API call failed: ${errorDetail}`);
            }

            const data = await response.json();

            // Accessing the text part correctly based on Gemini API response structure
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {
                let resultText = data.candidates[0].content.parts[0].text;

                // Clean the response if it's wrapped in ```json ... ``` or ``` ... ```
                resultText = resultText.replace(/^```json\s*([\s\S]*?)\s*```$/, '$1');
                resultText = resultText.replace(/^```([\s\S]*?)```$/, '$1');

                return resultText.trim();
            } else {
                console.error("Unexpected API response structure:", data);
                throw new Error("Could not extract text from API response. Check console for the full response.");
            }

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            throw error; // Re-throw the error to be caught by the caller
        }
    }

    // --- Render HTML Resume ---
    function renderHtmlResume(resumeJson, outputElement) {
        outputElement.innerHTML = ''; // Clear previous content (like "Generating...")

        if (!resumeJson || typeof resumeJson !== 'object') {
            outputElement.innerHTML = "<p>Error: No resume data to display or data is not in the correct format.</p>";
            return;
        }

        let html = `<div class="resume-render">`;

        // Contact Info
        if (resumeJson.contactInfo) {
            const ci = resumeJson.contactInfo;
            html += `<header class="resume-header">`;
            if (ci.name) html += `<h1>${ci.name}</h1>`;
            let contactDetails = [];
            if (ci.email) contactDetails.push(`<a href="mailto:${ci.email}">${ci.email}</a>`);
            if (ci.phone) contactDetails.push(ci.phone);
            if (ci.linkedin) contactDetails.push(`<a href="${ci.linkedin}" target="_blank">LinkedIn</a>`);
            if (ci.github) contactDetails.push(`<a href="${ci.github}" target="_blank">GitHub</a>`);
            if (ci.portfolio) contactDetails.push(`<a href="${ci.portfolio}" target="_blank">Portfolio</a>`);
            if (contactDetails.length > 0) html += `<p class="contact-details">${contactDetails.join(' | ')}</p>`;
            html += `</header>`;
        }

        // Summary
        if (resumeJson.summary) {
            html += `<section class="resume-section"><h2>Summary</h2><p>${resumeJson.summary}</p></section>`;
        }

        // Experience
        if (resumeJson.experience && resumeJson.experience.length > 0) {
            html += `<section class="resume-section"><h2>Experience</h2>`;
            resumeJson.experience.forEach(exp => {
                html += `<div class="job">`;
                html += `<h3>${exp.jobTitle || ''} at ${exp.company || ''}</h3>`;
                let subHeader = [];
                if(exp.location) subHeader.push(exp.location);
                if(exp.dates) subHeader.push(exp.dates);
                if(subHeader.length > 0) html += `<p class="job-subheader"><em>${subHeader.join(' | ')}</em></p>`;
                if (exp.duties && exp.duties.length > 0) {
                    html += `<ul>`;
                    exp.duties.forEach(duty => html += `<li>${duty}</li>`);
                    html += `</ul>`;
                }
                html += `</div>`;
            });
            html += `</section>`;
        }

        // Education
        if (resumeJson.education && resumeJson.education.length > 0) {
            html += `<section class="resume-section"><h2>Education</h2>`;
            resumeJson.education.forEach(edu => {
                html += `<div class="education-entry">`;
                html += `<h3>${edu.degree || ''} - ${edu.institution || ''}</h3>`;
                let eduDetails = [];
                if(edu.location) eduDetails.push(edu.location);
                if(edu.graduationDate) eduDetails.push(`Graduated: ${edu.graduationDate}`);
                if(edu.details) eduDetails.push(edu.details);
                if(eduDetails.length > 0) html += `<p><em>${eduDetails.join(' | ')}</em></p>`;
                html += `</div>`;
            });
            html += `</section>`;
        }

        // Skills
        if (resumeJson.skills) {
            html += `<section class="resume-section"><h2>Skills</h2>`;
            const s = resumeJson.skills;
            if (s.technical && s.technical.length > 0) html += `<p><strong>Technical:</strong> ${s.technical.join(', ')}</p>`;
            if (s.soft && s.soft.length > 0) html += `<p><strong>Soft:</strong> ${s.soft.join(', ')}</p>`;
            if (s.other && s.other.length > 0) html += `<p><strong>Other:</strong> ${s.other.join(', ')}</p>`;
            html += `</section>`;
        }

        // Projects
        if (resumeJson.projects && resumeJson.projects.length > 0) {
            html += `<section class="resume-section"><h2>Projects</h2>`;
            resumeJson.projects.forEach(proj => {
                html += `<div class="project-entry">`;
                html += `<h3>${proj.name || 'Unnamed Project'}</h3>`;
                if (proj.description) html += `<p>${proj.description}</p>`;
                if (proj.technologies && proj.technologies.length > 0) html += `<p><em>Technologies: ${proj.technologies.join(', ')}</em></p>`;
                if (proj.link) html += `<p><a href="${proj.link}" target="_blank">Project Link</a></p>`;
                html += `</div>`;
            });
            html += `</section>`;
        }

        // Certifications
        if (resumeJson.certifications && resumeJson.certifications.length > 0) {
            html += `<section class="resume-section"><h2>Certifications</h2>`;
            resumeJson.certifications.forEach(cert => {
                html += `<div class="certification-entry">`;
                html += `<p><strong>${cert.name || 'Unnamed Certification'}</strong> - ${cert.issuingOrganization || 'N/A'}`;
                if (cert.date) html += ` (${cert.date})`;
                html += `</p>`;
                html += `</div>`;
            });
            html += `</section>`;
        }

        // Awards
        if (resumeJson.awards && resumeJson.awards.length > 0) {
            html += `<section class="resume-section"><h2>Awards</h2>`;
            resumeJson.awards.forEach(award => {
                html += `<div class="award-entry">`;
                html += `<p><strong>${award.name || 'Unnamed Award'}</strong> - ${award.organization || 'N/A'}`;
                if (award.date) html += ` (${award.date})`;
                html += `</p>`;
                html += `</div>`;
            });
            html += `</section>`;
        }


        html += `</div>`; // end .resume-render
        outputElement.innerHTML = html;

        // Styles for rendered resume are now in style.css
    }
    console.log("Event listeners and functions defined.");
});

console.log("script.js loaded and parsed.");
