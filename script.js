import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm";

// Ensure pdfjsLib is available
if (typeof window.pdfjsLib === 'undefined') {
    console.error("pdf.js library is not loaded correctly.");
} else {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// Ensure mammoth is available
if (typeof window.mammoth === 'undefined') {
    console.error("mammoth.js library is not loaded correctly.");
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
            if (modelName) configInputs[service].model.value = modelName;
        }
        updateLLMConfigVisibility(selectedLLM);
        showMessage("LLM settings and API keys loaded from local storage.", 'info');
        setTimeout(clearMessage, 3000);
    }

    function saveLLMSetting(service, type, value) {
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

    loadLLMSettings();

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
            if (!messageArea.querySelector('.error-message')) {
                clearMessage();
            }
        }
    }

    // --- Clear All Button ---
    clearAllButton.addEventListener('click', () => {
        resumeFileInput.value = '';
        parsedResumeJsonTextarea.value = '';
        jobDescriptionTextarea.value = '';
        finalResumeOutputDiv.innerHTML = '';
        generatedCoverLetterTextarea.value = '';

        ['gemini', 'openai', 'claude'].forEach(service => {
            configInputs[service].apiKey.value = '';
            const defaultModel = document.getElementById(`${service}ModelName`).defaultValue || '';
            configInputs[service].model.value = defaultModel;
            localStorage.removeItem(`${service}ApiKey`);
            localStorage.removeItem(`${service}ModelName`);
        });

        clearMessage();
        showMessage("All fields and stored API keys/settings cleared.", 'info');
        setTimeout(clearMessage, 3000);
    });


    // --- Phase 1: Resume Parsing ---
    resumeFileInput.addEventListener('change', async (event) => {
        try {
            const file = event.target.files[0];
            clearMessage();
            if (!file) return;

            finalResumeOutputDiv.innerHTML = "";
            generatedCoverLetterTextarea.value = "";
            parsedResumeJsonTextarea.value = "";

            setLoadingState(true);
            parsedResumeJsonTextarea.value = "Extracting text from file...";

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
                    throw new Error("Unsupported file type. Please upload .pdf or .docx");
                }

                if (!rawText.trim()) {
                    throw new Error("Could not extract text from file. The file might be empty or corrupted.");
                }

                const jsonSchema = {
                    contactInfo: { name: "string", email: "string", phone: "string", linkedin: "string (optional)", github: "string (optional)", portfolio: "string (optional)" },
                    summary: "string",
                    experience: [{ jobTitle: "string", company: "string", location: "string (optional)", dates: "string (e.g., MM/YYYY - MM/YYYY or Present)", duties: ["string"] }],
                    education: [{ institution: "string", degree: "string", graduationDate: "string (e.g., MM/YYYY or Expected MM/YYYY)", location: "string (optional)", details: "string (optional, e.g., GPA, honors)" }],
                    skills: { technical: ["string"], soft: ["string"], other: ["string (optional)"] },
                    projects: [{ name: "string", description: "string", technologies: ["string"], link: "string (optional)" }],
                    certifications: [{ name: "string", issuingOrganization: "string", date: "string (optional)" }],
                    awards: [{ name: "string", organization: "string", date: "string (optional)" }]
                };
                const parserPrompt = `Analyze the following resume text and convert it into a JSON object with this exact structure: ${JSON.stringify(jsonSchema, null, 2)}. Ensure all string values are properly escaped. Here is the text: \n\n${rawText}`;

                showMessage("Sending to AI for parsing...", 'info');
                parsedResumeJsonTextarea.value = "Sending to AI for parsing...";
                const parsedJson = await callLLMAPI(parserPrompt);
                parsedResumeJsonTextarea.value = parsedJson;
                showMessage("Resume parsed successfully. You can now edit the JSON if needed.", 'info');

            } catch (error) {
                console.error("Error during Phase 1 processing (file reading/API call):", error);
                const userErrorMessage = `Error during file processing: ${error.message}.`;
                parsedResumeJsonTextarea.value = userErrorMessage;
                showMessage(userErrorMessage, 'error');
            } finally {
                setLoadingState(false);
            }
        } catch (e) {
            console.error("Unexpected error in resume file input handler:", e);
            showMessage(`An unexpected error occurred: ${e.message}.`, 'error');
            setLoadingState(false);
        }
    });

    // --- Phase 2: Tailoring and Cover Letter ---
    generateButton.addEventListener('click', async () => {
        try {
            clearMessage();
            const resumeJsonString = parsedResumeJsonTextarea.value.trim();
            const jobDesc = jobDescriptionTextarea.value.trim();

            if (!resumeJsonString) throw new Error("Parsed Resume JSON is missing. Please upload a resume first.");
            if (!jobDesc) throw new Error("Job Description is missing. Please paste it in the textarea.");

            setLoadingState(true);
            finalResumeOutputDiv.innerHTML = "";
            generatedCoverLetterTextarea.value = "";
            showMessage("Generating tailored resume and cover letter...", 'info');

            try {
                let resumeJson = JSON.parse(resumeJsonString);

                const tailorPrompt = `Act as a career coach. Rewrite the content of the following resume.json (especially "summary" and "experience" sections, and "duties" within experience) to align perfectly with the keywords and requirements of the provided job description. Return a JSON object with the *exact same structure* as the input resume.json. Do not add new top-level keys or change the existing schema. Ensure all string values are properly escaped. \n\nResume JSON:\n${JSON.stringify(resumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;
                const tailoredResumeJsonString = await callLLMAPI(tailorPrompt);
                let tailoredResumeJson = JSON.parse(tailoredResumeJsonString);

                renderHtmlResume(tailoredResumeJson, finalResumeOutputDiv);
                showMessage("Tailored resume generated. Now generating cover letter...", 'info');

                const coverLetterPrompt = `Generate a professional and customized cover letter based on the following tailored resume JSON and job description. The cover letter should be ready to send, filling in all placeholders. If critical information like the hiring manager's name or specific company address is missing and cannot be inferred, mention that such details might need to be added by the user. The tone should be enthusiastic and professional. Highlight key achievements and skills from the resume that match the job description. \n\nTailored Resume JSON:\n${JSON.stringify(tailoredResumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;
                const coverLetterText = await callLLMAPI(coverLetterPrompt);
                generatedCoverLetterTextarea.value = coverLetterText;
                showMessage("Tailored resume and cover letter generated successfully!", 'info');

            } catch (error) {
                console.error("Error during Phase 2 processing (API calls/JSON parsing):", error);
                const userErrorMessageP2 = `Error during tailoring/generation: ${error.message}.`;
                showMessage(userErrorMessageP2, 'error');
                finalResumeOutputDiv.innerHTML = `<p class="error-message">${userErrorMessageP2}</p>`;
            } finally {
                setLoadingState(false);
            }
        } catch (e) {
            console.error("Unexpected error in generate button click handler:", e);
            showMessage(`An unexpected error occurred: ${e.message}.`, 'error');
            setLoadingState(false);
        }
    });

    // --- Helper to get current LLM configuration ---
    function getCurrentLLMConfig() {
        const selectedService = llmSelection.value;
        const apiKey = configInputs[selectedService].apiKey.value.trim();
        const modelName = configInputs[selectedService].model.value.trim();
        if (!apiKey) throw new Error(`API Key for ${selectedService.toUpperCase()} is missing.`);
        if (!modelName) throw new Error(`Model Name for ${selectedService.toUpperCase()} is missing.`);
        return { service: selectedService, apiKey, modelName };
    }

    // --- Unified LLM API Call Function ---
    async function callLLMAPI(promptText) {
        const { service, apiKey, modelName } = getCurrentLLMConfig();
        try {
            let content = "";
            if (service === 'gemini') {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(promptText);
                const response = await result.response;
                content = response.text();
            } else if (service === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ model: modelName, messages: [{ role: "user", content: promptText }], temperature: 0.7 })
                });
                if (!response.ok) { const errorData = await response.json(); throw new Error(`OpenAI: ${errorData.error?.message || response.statusText}`); }
                const data = await response.json();
                content = data.choices[0]?.message?.content || "";
            } else if (service === 'claude') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
                    body: JSON.stringify({ model: modelName, max_tokens: 3000, messages: [{ role: "user", content: promptText }] })
                });
                if (!response.ok) { const errorData = await response.json(); throw new Error(`Claude: ${errorData.error?.message || response.statusText}`); }
                const data = await response.json();
                content = data.content[0]?.text || "";
            }
            let cleanedText = content.replace(/^```json\s*([\s\S]*?)\s*```$/, '$1').trim();
            return cleanedText;
        } catch (error) {
            console.error(`Error calling ${service.toUpperCase()} API:`, error);
            if (error.message.includes("API key")) { throw new Error(`The API key for ${service.toUpperCase()} appears to be invalid.`); }
            if (error.message.includes("model not found")) { throw new Error(`The model "${modelName}" for ${service.toUpperCase()} was not found.`); }
            if (error.message.includes("quota")) { throw new Error(`You may have exceeded your API quota for ${service.toUpperCase()}.`); }
            throw error;
        }
    }

    // --- Render HTML Resume ---
    function renderHtmlResume(resumeJson, outputElement) {
        outputElement.innerHTML = ''; // Clear previous content
        if (!resumeJson || typeof resumeJson !== 'object') {
            outputElement.innerHTML = "<p>Error: No resume data to display.</p>";
            return;
        }
        let html = `<div class="resume-render">`;
        const ci = resumeJson.contactInfo;
        if (ci) {
            html += `<header class="resume-header">`;
            if (ci.name) html += `<h1>${ci.name}</h1>`;
            let details = [ci.email, ci.phone, ci.linkedin, ci.github, ci.portfolio].filter(Boolean).join(' | ');
            html += `<p class="contact-details">${details}</p></header>`;
        }
        if (resumeJson.summary) html += `<section class="resume-section"><h2>Summary</h2><p>${resumeJson.summary}</p></section>`;
        if (resumeJson.experience?.length) {
            html += `<section class="resume-section"><h2>Experience</h2>`;
            resumeJson.experience.forEach(exp => {
                html += `<div class="job"><h3>${exp.jobTitle || ''} at ${exp.company || ''}</h3><p class="job-subheader"><em>${[exp.location, exp.dates].filter(Boolean).join(' | ')}</em></p>`;
                if (exp.duties?.length) html += `<ul>${exp.duties.map(d => `<li>${d}</li>`).join('')}</ul>`;
                html += `</div>`;
            });
            html += `</section>`;
        }
        // ... (Similar condensed rendering for other sections) ...
        html += `</div>`;
        outputElement.innerHTML = html;
    }
    console.log("Event listeners and functions defined.");

    // --- Download Functionality ---
    const downloadResumeButton = document.getElementById('downloadResumeButton');
    const downloadCoverLetterButton = document.getElementById('downloadCoverLetterButton');

    downloadResumeButton.addEventListener('click', () => {
        const resumeRenderDiv = finalResumeOutputDiv.querySelector('.resume-render');
        if (!resumeRenderDiv || !resumeRenderDiv.innerHTML.trim()) {
            showMessage("No resume content available to download.", 'error');
            return;
        }

        if (typeof html2pdf === 'undefined') {
            showMessage("PDF generation library is not loaded. Please refresh.", 'error');
            return;
        }

        showMessage("Generating PDF, please wait...", 'info');

        // 1. Create a temporary, hidden container for printing.
        const printContainer = document.createElement('div');
        printContainer.style.position = 'fixed';
        printContainer.style.left = '-9999px';
        printContainer.style.top = '0px';

        // 2. Define all necessary CSS styles as a string.
        const styles = `
            body { font-family: Arial, sans-serif; color: #333; }
            .resume-render { padding: 0; margin: 0; background: #fff; }
            .resume-render h1, .resume-render h2, .resume-render h3 { margin-top: 1.2em; margin-bottom: 0.6em; }
            .resume-render h1 { font-size: 24px; color: #2c3e50; text-align: left; }
            .resume-render .contact-details { font-size: 12px; color: #555; }
            .resume-render .contact-details a { color: #3498db; text-decoration: none; }
            .resume-render h2 { font-size: 18px; border-bottom: 2px solid #3498db; padding-bottom: 5px; color: #3498db; }
            .resume-render .resume-section, .resume-render .job, .resume-render .education-entry, .resume-render .project-entry { margin-bottom: 15px; }
            .resume-render h3 { font-size: 16px; color: #34495e; }
            .resume-render .job-subheader { font-size: 13px; color: #7f8c8d; }
            .resume-render ul { list-style-type: disc; margin-left: 20px; padding-left: 0; }
            .resume-render li, .resume-render p { line-height: 1.4; margin-bottom: 0.5em; }
        `;

        // 3. Get the inner HTML of the resume content.
        const resumeContentHtml = resumeRenderDiv.innerHTML;

        // 4. Set the content of our hidden container.
        printContainer.innerHTML = `<style>${styles}</style><div class="resume-render">${resumeContentHtml}</div>`;

        // 5. Append the hidden container to the body so it becomes a live DOM element.
        document.body.appendChild(printContainer);

        const opt = {
            margin: 0.5,
            filename: 'tailored_resume.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak: { mode: 'avoid-all', before: '.resume-section' }
        };

        // 6. Generate the PDF from the hidden element, ensuring .from() is before .set().
        html2pdf().from(printContainer).set(opt).save().then(() => {
            // 7. Remove the temporary container after generation is complete.
            document.body.removeChild(printContainer);
            showMessage("PDF Download Started.", 'info');
            setTimeout(clearMessage, 3000);
        }).catch((err) => {
            console.error("PDF Generation failed:", err);
            showMessage("An error occurred during PDF generation.", "error");
            document.body.removeChild(printContainer); // Also remove on error
        });
    });


    downloadCoverLetterButton.addEventListener('click', () => {
        const coverLetterText = generatedCoverLetterTextarea.value;
        if (!coverLetterText.trim()) {
            showMessage("No cover letter content available to download.", 'error');
            return;
        }
        const prettyCoverLetterHtml = coverLetterText.replace(/\n/g, '<br>');
        const fullHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Generated Cover Letter</title><link rel="stylesheet" href="style.css"></head><body><div class="container"><div class="resume-render" style="padding: 20px; margin-top:20px;"><h2>Cover Letter</h2><p>${prettyCoverLetterHtml}</p></div></div></body></html>`;
        triggerDownload(fullHtml, 'generated_cover_letter.html');
    });

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
    }

    console.log("script.js loaded and parsed.");
});