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
    const loadingBanner = document.getElementById('loadingBanner');

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

    function setLoadingState(isLoading, message = "Processing...") {
        generateButton.disabled = isLoading;
        resumeFileInput.disabled = isLoading;

        if (isLoading) {
            loadingBanner.textContent = message;
            loadingBanner.style.display = 'block';
            if (document.activeElement === generateButton || (event && event.target === generateButton)) {
                showMessage(message, 'info');
            } else if (document.activeElement === resumeFileInput || (event && event.target === resumeFileInput)) {
                showMessage(message, 'info');
            }
        } else {
            loadingBanner.style.display = 'none';
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

            setLoadingState(true, "Processing file, please wait...");
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

                setLoadingState(true, "Sending to AI for parsing...");
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

            setLoadingState(true, "Generating tailored resume and cover letter...");
            finalResumeOutputDiv.innerHTML = "";
            generatedCoverLetterTextarea.value = "";

            try {
                let resumeJson = JSON.parse(resumeJsonString);

                const tailorPrompt = `Act as a career coach. Rewrite the content of the following resume.json (especially "summary" and "experience" sections, and "duties" within experience) to align perfectly with the keywords and requirements of the provided job description. Return a JSON object with the *exact same structure* as the input resume.json. Do not add new top-level keys or change the existing schema. Ensure all string values are properly escaped. \n\nResume JSON:\n${JSON.stringify(resumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;
                setLoadingState(true, "Tailoring resume with AI...");
                const tailoredResumeJsonString = await callLLMAPI(tailorPrompt);
                let tailoredResumeJson = JSON.parse(tailoredResumeJsonString);

                renderHtmlResume(tailoredResumeJson, finalResumeOutputDiv);
                showMessage("Tailored resume generated. Now generating cover letter...", 'info');

                const coverLetterPrompt = `Generate a professional and customized cover letter using the provided tailored resume JSON and job description.
**Formatting Instructions:**
1.  **Sender's Contact Information:** At the top, include the sender's name, phone number, email, LinkedIn profile URL, and GitHub profile URL. ONLY include these details if they are present in the \`contactInfo\` section of the resume JSON. DO NOT use bracketed placeholders like "[Your Name]". Directly use the values from the JSON. If a specific detail (e.g., GitHub URL) is missing from the JSON, omit that line entirely.
2.  **Date:** Include the current date after the sender's contact information.
3.  **Recipient's Information:** If the hiring manager's name can be inferred from the job description, use it. Otherwise, use a generic greeting like "Dear Hiring Team,".
4.  **Body of the Letter:** The tone should be enthusiastic and professional. Highlight key achievements and skills from the resume that directly match the requirements in the job description.
5.  **Closing:** Use a professional closing (e.g., "Sincerely,"). Followed by the sender's name (from \`resumeJson.contactInfo.name\`).
**DO NOT include bracketed placeholders for information that should come directly from the resume JSON (like name, phone, email).** The goal is a ready-to-send letter.
Tailored Resume JSON:\n${JSON.stringify(tailoredResumeJson, null, 2)}\n\nJob Description:\n${jobDesc}`;
                setLoadingState(true, "Generating cover letter with AI...");
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
        const resumeJsonString = parsedResumeJsonTextarea.value.trim();
        if (!resumeJsonString) {
            showMessage("No resume JSON available to generate a PDF.", 'error');
            return;
        }

        if (typeof window.jspdf === 'undefined') {
            showMessage("PDF generation library (jsPDF) is not loaded. Please refresh.", 'error');
            return;
        }

        let resumeJson;
        try {
            resumeJson = JSON.parse(resumeJsonString);
        } catch (e) {
            showMessage("The Parsed Resume JSON is not valid. Please correct it.", 'error');
            return;
        }

        setLoadingState(true, "Generating Native PDF...");

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'in',
                format: 'letter'
            });

            // --- PDF Generation Logic ---
            const margin = 0.75;
            const pageHeight = doc.internal.pageSize.getHeight();
            const contentWidth = doc.internal.pageSize.getWidth() - (margin * 2);
            let y = margin;

            const addPageIfNeeded = (spaceNeeded) => {
                if (y + spaceNeeded > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
            };

            const renderSection = (title, contentRenderer) => {
                if (y > margin) { y += 0.2; } // Add space between sections
                addPageIfNeeded(0.5);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.text(title, margin, y);
                doc.setLineWidth(0.01);
                doc.line(margin, y + 0.05, margin + contentWidth, y + 0.05);
                y += 0.25;
                contentRenderer();
            };

            // 1. Header
            const ci = resumeJson.contactInfo;
            if (ci && ci.name) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(22);
                doc.text(ci.name, margin, y);
                y += 0.3;

                let contactLine = [ci.email, ci.phone].filter(Boolean).join(' | ');
                let linkLine = [ci.linkedin, ci.github, ci.portfolio].filter(Boolean).join(' | ');
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                if (contactLine) { doc.text(contactLine, margin, y); y += 0.2; }
                if (linkLine) { doc.text(linkLine, margin, y); y += 0.2; }
            }

            // 2. Summary
            if (resumeJson.summary) {
                renderSection("Summary", () => {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(11);
                    const summaryLines = doc.splitTextToSize(resumeJson.summary, contentWidth);
                    addPageIfNeeded(summaryLines.length * 0.2);
                    doc.text(summaryLines, margin, y);
                    y += (summaryLines.length * 0.2);
                });
            }

            // 3. Experience
            if (resumeJson.experience?.length) {
                renderSection("Experience", () => {
                    resumeJson.experience.forEach(job => {
                        addPageIfNeeded(0.5);
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(12);
                        doc.text(`${job.jobTitle} - ${job.company}`, margin, y);

                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(10);
                        doc.text([job.location, job.dates].filter(Boolean).join(' | '), doc.internal.pageSize.getWidth() - margin, y, { align: 'right' });
                        y += 0.25;

                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(11);
                        job.duties.forEach(duty => {
                            const dutyLines = doc.splitTextToSize(`• ${duty}`, contentWidth - 0.2);
                            addPageIfNeeded(dutyLines.length * 0.2);
                            doc.text(dutyLines, margin + 0.1, y);
                            y += (dutyLines.length * 0.2) + 0.05;
                        });
                        y += 0.1;
                    });
                });
            }

            // 4. Education
            if (resumeJson.education?.length) {
                renderSection("Education", () => {
                    resumeJson.education.forEach(edu => {
                        addPageIfNeeded(0.4);
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(12);
                        doc.text(edu.institution, margin, y);

                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(10);
                        doc.text(edu.graduationDate, doc.internal.pageSize.getWidth() - margin, y, { align: 'right' });
                        y += 0.2;

                        doc.setFont('helvetica', 'normal');
                        doc.text(`${edu.degree} ${edu.details ? `(${edu.details})` : ''}`, margin, y);
                        y += 0.25;
                    });
                });
            }

            // 5. Skills
            if (resumeJson.skills) {
                renderSection("Skills", () => {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(11);
                    const skillsText = `Technical: ${resumeJson.skills.technical?.join(', ') || 'N/A'}`;
                    const skillLines = doc.splitTextToSize(skillsText, contentWidth);
                    addPageIfNeeded(skillLines.length * 0.2);
                    doc.text(skillLines, margin, y);
                    y += (skillLines.length * 0.2);
                });
            }

            doc.save('tailored_resume.pdf');
        } catch (err) {
            console.error("PDF Generation failed:", err);
            showMessage(`An error occurred during PDF generation: ${err.message || err}`, "error");
        } finally {
            setLoadingState(false);
        }
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