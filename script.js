
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm";

// Ensure pdfjsLib is available
if (typeof window.pdfjsLib === 'undefined') {
    console.error("pdf.js library is not loaded correctly.");
    // Potentially display an error to the user on the page
} else {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// Ensure mammoth is available
if (typeof window.mammoth === 'undefined') {
    console.error("mammoth.js library is not loaded correctly.");
    // Potentially display an error to the user on the page
}


document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded");

    // Element selectors
    const llmSelection = document.getElementById('llmSelection');
    const geminiConfigDiv = document.getElementById('geminiConfig');
    const openaiConfigDiv = document.getElementById('openaiConfig');
    const claudeConfigDiv = document.getElementById('claudeConfig');

    const geminiApiKeyInput = document.getElementById('geminiApiKey');
    const geminiModelNameInput = document.getElementById('geminiModelName');
    const openaiApiKeyInput = document.getElementById('openaiApiKey');
    const openaiModelNameInput = document.getElementById('openaiModelName');
    const claudeApiKeyInput = document.getElementById('claudeApiKey');
    const claudeModelNameInput = document.getElementById('claudeModelName');

    const resumeFileInput = document.getElementById('resumeFile');
    const parsedResumeJsonTextarea = document.getElementById('parsedResumeJson');
    const jobDescriptionTextarea = document.getElementById('jobDescription');
    const generateButton = document.getElementById('generateTailoredResumeAndCoverLetter');
    const finalResumeOutputDiv = document.getElementById('finalResumeOutput');
    const generatedCoverLetterTextarea = document.getElementById('generatedCoverLetter');
    const messageArea = document.getElementById('messageArea');
    const clearAllButton = document.getElementById('clearAllButton');

    // --- LLM Configuration and API Key Storage ---
    const configInputs = {
        gemini: { apiKey: geminiApiKeyInput, model: geminiModelNameInput, div: geminiConfigDiv },
        openai: { apiKey: openaiApiKeyInput, model: openaiModelNameInput, div: openaiConfigDiv },
        claude: { apiKey: claudeApiKeyInput, model: claudeModelNameInput, div: claudeConfigDiv }
    };

    function loadLLMSettings() {
        const selectedLLM = localStorage.getItem('selectedLLM') || 'gemini';
        llmSelection.value = selectedLLM;

        for (const service in configInputs) {
            const apiKey = localStorage.getItem(`${service}ApiKey`);
            const modelName = localStorage.getItem(`${service}ModelName`);
            if (apiKey) configInputs[service].apiKey.value = apiKey;
            if (modelName) configInputs[service].model.value = modelName; // Load even if default is set in HTML
        }
        updateLLMConfigVisibility(selectedLLM);
        showMessage("LLM settings and API keys loaded from local storage.", 'info');
        setTimeout(clearMessage, 3000);
    }

    function saveLLMSetting(service, type, value) { // type can be 'ApiKey' or 'ModelName'
        localStorage.setItem(`${service}${type}`, value);
    }

    function updateLLMConfigVisibility(selectedLLM) {
        ['gemini', 'openai', 'claude'].forEach(service => {
            configInputs[service].div.style.display = (service === selectedLLM) ? 'block' : 'none';
        });
    }

    llmSelection.addEventListener('change', (e) => {
        const selectedLLM = e.target.value;
        localStorage.setItem('selectedLLM', selectedLLM);
        updateLLMConfigVisibility(selectedLLM);
    });

    ['gemini', 'openai', 'claude'].forEach(service => {
        configInputs[service].apiKey.addEventListener('input', (e) => saveLLMSetting(service, 'ApiKey', e.target.value.trim()));
        configInputs[service].model.addEventListener('input', (e) => saveLLMSetting(service, 'ModelName', e.target.value.trim()));
    });

    loadLLMSettings(); // Load settings on startup

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
        resumeFileInput.value = ''; // Clears the selected file
        parsedResumeJsonTextarea.value = '';
        jobDescriptionTextarea.value = '';
        finalResumeOutputDiv.innerHTML = '';
        generatedCoverLetterTextarea.value = '';

        ['gemini', 'openai', 'claude'].forEach(service => {
            configInputs[service].apiKey.value = '';
            // Reset model to default or clear it if you prefer
            // For now, let's reset to HTML defaults if they exist, or clear
            const defaultModel = document.getElementById(`${service}ModelName`).defaultValue || '';
            configInputs[service].model.value = defaultModel;

            localStorage.removeItem(`${service}ApiKey`);
            localStorage.removeItem(`${service}ModelName`);
        });
        // localStorage.removeItem('selectedLLM'); // Optionally reset LLM selection
        // llmSelection.value = 'gemini'; // Optionally reset to default
        // updateLLMConfigVisibility('gemini');


        clearMessage();
        showMessage("All fields and stored API keys/settings cleared.", 'info');
        setTimeout(clearMessage, 3000);
    });


    // --- Phase 1: Resume Parsing ---
    resumeFileInput.addEventListener('change', async (event) => {
        try { // Outer try-catch for the entire event handler
            const file = event.target.files[0];
            clearMessage();
            if (!file) {
                return;
            }

            finalResumeOutputDiv.innerHTML = "";
            generatedCoverLetterTextarea.value = "";
            parsedResumeJsonTextarea.value = "";

            // API key and model will be checked by getCurrentLLMConfig within callLLMAPI
            // No need to get apiKey here directly anymore.

            setLoadingState(true);
            parsedResumeJsonTextarea.value = "Extracting text from file...";

            // Inner try-catch specifically for file processing and API call
            try {
                let rawText = '';
                if (file.type === "application/pdf") {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        rawText += textContent.items.map(item => item.str).join(' ') + '\n';
                    }
                } else if (file.name.endsWith(".docx")) {
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                    rawText = result.value;
                } else {
                    parsedResumeJsonTextarea.value = "Error: Unsupported file type. Please upload .pdf or .docx";
                    showMessage("Error: Unsupported file type. Please upload .pdf or .docx", 'error');
                    setLoadingState(false); // Ensure loading state is reset
                    return;
                }

                if (!rawText.trim()) {
                    parsedResumeJsonTextarea.value = "Error: Could not extract text from file. The file might be empty or corrupted.";
                    showMessage("Error: Could not extract text from file. The file might be empty or corrupted.", 'error');
                    setLoadingState(false); // Ensure loading state is reset
                    return;
                }

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
                    projects: [{ name: "string", description: "string", technologies: ["string"], link: "string (optional)" }],
                    certifications: [{ name: "string", issuingOrganization: "string", date: "string (optional)" }],
                    awards: [{ name: "string", organization: "string", date: "string (optional)" }]
                };

                const parserPrompt = `Analyze the following resume text and convert it into a JSON object with this exact structure: ${JSON.stringify(jsonSchema, null, 2)}. Ensure all string values are properly escaped. Here is the text: \n\n${rawText}`;

                showMessage("Sending to AI for parsing...", 'info');
                parsedResumeJsonTextarea.value = "Sending to AI for parsing...";
                // const parsedJson = await callGeminiAPI(apiKey, parserPrompt); // Old call
                const parsedJson = await callLLMAPI(parserPrompt); // New call
                parsedResumeJsonTextarea.value = parsedJson;
                showMessage("Resume parsed successfully. You can now edit the JSON if needed.", 'info');

            } catch (error) {
                console.error("Error during Phase 1 processing (file reading/API call):", error);
                const userErrorMessage = `Error during file processing: ${error.message}. Check console for more details.`;
                parsedResumeJsonTextarea.value = userErrorMessage;
                // Specific error messages are now handled more generically by callLLMAPI or its helper
                showMessage(userErrorMessage, 'error');
            } finally {
                setLoadingState(false);
            }
        } catch (e) { // Catch errors from the outer try-catch
            console.error("Unexpected error in resume file input handler:", e);
            showMessage(`An unexpected error occurred: ${e.message}. Please check the console.`, 'error');
            setLoadingState(false); // Ensure loading state is reset
        }
    });

    // --- Phase 2: Tailoring and Cover Letter ---
    generateButton.addEventListener('click', async () => {
        try { // Outer try-catch for the entire event handler
            clearMessage();
            // const apiKey = apiKeyInput.value.trim(); // Old way
            const resumeJsonString = parsedResumeJsonTextarea.value.trim();
            const jobDesc = jobDescriptionTextarea.value.trim();

            // API key will be checked by getCurrentLLMConfig within callLLMAPI
            if (!resumeJsonString) {
                showMessage("Parsed Resume JSON is missing. Please upload a resume first.", 'error');
                return;
            }
            if (!jobDesc) {
                showMessage("Job Description is missing. Please paste it in the textarea.", 'error');
                return;
            }

            setLoadingState(true);
            finalResumeOutputDiv.innerHTML = "";
            generatedCoverLetterTextarea.value = "";
            showMessage("Generating tailored resume and cover letter...", 'info');

            // Inner try-catch for API calls and JSON parsing
            try {
                let resumeJson;
                try {
                    resumeJson = JSON.parse(resumeJsonString);
                } catch (e) {
                    showMessage("The Parsed Resume JSON is not valid. Please correct it before proceeding.", 'error');
                    setLoadingState(false);
                    return;
                }

                const tailorPrompt = `Act as a career coach. Rewrite the content of the following resume.json (especially "summary" and "experience" sections, and "duties" within experience) to align perfectly with the keywords and requirements of the provided job description. Return a JSON object with the *exact same structure* as the input resume.json. Do not add new top-level keys or change the existing schema. Ensure all string values are properly escaped. \n\nResume JSON:\n${JSON.stringify(resumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;

                // const tailoredResumeJsonString = await callGeminiAPI(apiKey, tailorPrompt); // Old
                const tailoredResumeJsonString = await callLLMAPI(tailorPrompt); // New
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

                renderHtmlResume(tailoredResumeJson, finalResumeOutputDiv);
                showMessage("Tailored resume generated. Now generating cover letter...", 'info');

                const coverLetterPrompt = `Generate a professional and customized cover letter based on the following tailored resume JSON and job description. The cover letter should be ready to send, filling in all placeholders. If critical information like the hiring manager's name or specific company address is missing and cannot be inferred, mention that such details might need to be added by the user. The tone should be enthusiastic and professional. Highlight key achievements and skills from the resume that match the job description. \n\nTailored Resume JSON:\n${JSON.stringify(tailoredResumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;

                // const coverLetterText = await callGeminiAPI(apiKey, coverLetterPrompt); // Old
                const coverLetterText = await callLLMAPI(coverLetterPrompt); // New
                generatedCoverLetterTextarea.value = coverLetterText;
                showMessage("Tailored resume and cover letter generated successfully!", 'info');

            } catch (error) {
                console.error("Error during Phase 2 processing (API calls/JSON parsing):", error);
                const userErrorMessageP2 = `Error during tailoring/generation: ${error.message}. Check console for details.`;
                showMessage(userErrorMessageP2, 'error');
                finalResumeOutputDiv.innerHTML = `Error: ${error.message}`;
                generatedCoverLetterTextarea.value = `Error: ${error.message}`;
                // Specific error messages are now handled more generically by callLLMAPI
            } finally {
                setLoadingState(false);
            }
        } catch (e) { // Catch errors from the outer try-catch
            console.error("Unexpected error in generate button click handler:", e);
            showMessage(`An unexpected error occurred: ${e.message}. Please check the console.`, 'error');
            setLoadingState(false); // Ensure loading state is reset
        }
    });

    // --- Helper to get current LLM configuration ---
    function getCurrentLLMConfig() {
        const selectedService = llmSelection.value;
        const apiKey = configInputs[selectedService].apiKey.value.trim();
        const modelName = configInputs[selectedService].model.value.trim();

        if (!apiKey) {
            showMessage(`API Key for ${selectedService.toUpperCase()} is missing. Please enter it in the settings.`, 'error');
            throw new Error(`API Key for ${selectedService.toUpperCase()} is missing.`);
        }
        if (!modelName) {
            // This case should ideally be prevented by having default values or validation
            showMessage(`Model Name for ${selectedService.toUpperCase()} is missing. Please enter it in the settings.`, 'error');
            throw new Error(`Model Name for ${selectedService.toUpperCase()} is missing.`);
        }
        return { service: selectedService, apiKey, modelName };
    }

    // --- Unified LLM API Call Function ---
    async function callLLMAPI(promptText) {
        const { service, apiKey, modelName } = getCurrentLLMConfig(); // This will throw if key/model is missing

        try {
            let content = "";
            if (service === 'gemini') {
                // Uses GoogleGenerativeAI SDK
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(promptText);
                const response = await result.response;
                content = response.text();

            } else if (service === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [{ role: "user", content: promptText }],
                        temperature: 0.7 // Adjust as needed
                    })
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error("OpenAI API Error:", errorData);
                    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
                }
                const data = await response.json();
                content = data.choices[0]?.message?.content || "";

            } else if (service === 'claude') {
                // Anthropic Claude (Messages API)
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: modelName,
                        max_tokens: 3000, // Adjust as needed, Claude requires max_tokens
                        messages: [{ role: "user", content: promptText }]
                    })
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error("Claude API Error:", errorData);
                    throw new Error(`Claude API Error: ${errorData.error?.message || response.statusText}`);
                }
                const data = await response.json();
                content = data.content[0]?.text || "";
            }

            // Clean the response if it's wrapped in ```json ... ``` or ``` ... ```
            // This is a common way LLMs return JSON, so good to keep.
            let cleanedText = content.replace(/^```json\s*([\s\S]*?)\s*```$/, '$1');
            cleanedText = cleanedText.replace(/^```([\s\S]*?)```$/, '$1');
            return cleanedText.trim();

        } catch (error) {
            console.error(`Error calling ${service.toUpperCase()} API:`, error);
            // More specific error messages based on common issues
            if (error.message.includes("API key not valid") || error.message.includes("Incorrect API key")) {
                throw new Error(`The API key for ${service.toUpperCase()} is not valid. Please check and try again.`);
            } else if (error.message.includes("model not found") || error.message.includes("Invalid model")) {
                throw new Error(`The model name "${modelName}" for ${service.toUpperCase()} could not be found or is invalid.`);
            } else if (error.message.includes("quota") || error.message.includes("limit")) {
                throw new Error(`You may have exceeded your quota or rate limit for the ${service.toUpperCase()} API.`);
            }
            throw error; // Re-throw other errors to be caught by the caller
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
                if (exp.location) subHeader.push(exp.location);
                if (exp.dates) subHeader.push(exp.dates);
                if (subHeader.length > 0) html += `<p class="job-subheader"><em>${subHeader.join(' | ')}</em></p>`;
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
                if (edu.location) eduDetails.push(edu.location);
                if (edu.graduationDate) eduDetails.push(`Graduated: ${edu.graduationDate}`);
                if (edu.details) eduDetails.push(edu.details);
                if (eduDetails.length > 0) html += `<p><em>${eduDetails.join(' | ')}</em></p>`;
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

    // --- Download Functionality ---
    function triggerDownload(content, filename, mimeType = 'text/html') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage(`${filename} download started.`, 'info');
        setTimeout(clearMessage, 3000);
    }

    const downloadResumeButton = document.getElementById('downloadResumeButton');
    const downloadCoverLetterButton = document.getElementById('downloadCoverLetterButton');

    downloadResumeButton.addEventListener('click', () => {
        const resumeHtmlContent = finalResumeOutputDiv.innerHTML;
        if (!resumeHtmlContent.trim() || resumeHtmlContent.startsWith("<p>Error:")) {
            showMessage("No resume content available to download or content contains an error.", 'error');
            return;
        }

        if (typeof html2pdf === 'undefined') {
            showMessage("PDF generation library (html2pdf.js) is not loaded. Please check your internet connection and refresh.", 'error');
            console.error("html2pdf.js is not loaded.");
            return;
        }

        showMessage("Generating PDF, please wait...", 'info');

        const element = finalResumeOutputDiv.querySelector('.resume-render');
        const opt = {
            margin: 0.5,
            filename: 'tailored_resume.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
        };
        html2pdf().from(element).set(opt).save();
    });

    downloadCoverLetterButton.addEventListener('click', () => {
        const coverLetterText = generatedCoverLetterTextarea.value;
        if (!coverLetterText.trim()) {
            showMessage("No cover letter content available to download.", 'error');
            return;
        }

        // Make it "pretty" by converting newlines to <br> and wrapping in a styled div
        const prettyCoverLetterHtml = coverLetterText.replace(/\n/g, '<br>');

        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generated Cover Letter</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="container">
<div class="resume-render" style="padding: 20px; margin-top:20px;">  <!-- Re-use resume-render for similar styling -->
<h2>Cover Letter</h2>
<p>${prettyCoverLetterHtml}</p>
</div>
</div>
</body>
</html>`;
        triggerDownload(fullHtml, 'generated_cover_letter.html');
    });

    console.log("script.js loaded and parsed.");
})