# AI Resume Specializer & Cover Letter Generator

This application helps you tailor your resume and generate a cover letter for specific job applications using the power of Large Language Models (LLMs). You can choose between Google Gemini, OpenAI (ChatGPT), and Anthropic Claude to power the generation process.

## Features

*   **Resume Upload:** Upload your existing resume in PDF (.pdf) or Word (.docx) format.
*   **Job Description Input:** Paste the job description you're applying for.
*   **LLM Selection:** Choose your preferred LLM provider:
    *   Google Gemini
    *   OpenAI (ChatGPT)
    *   Anthropic Claude
*   **API Key Management:** Input your API key for the chosen provider. The application also allows you to specify the model name you wish to use (pre-filled with common defaults).
*   **Local Storage:** Your selected LLM, API keys, and model names are saved in your browser's `localStorage` for convenience, so you don't have to re-enter them every time.
*   **Resume Parsing:** The application parses your resume's text and converts it into a structured JSON format. You can view and edit this JSON before further processing.
*   **AI-Powered Tailoring:**
    *   **Tailored Resume:** Generates a version of your resume with content (summary, experience) specifically rephrased and highlighted to match the job description.
    *   **Tailored Cover Letter:** Creates a draft cover letter based on your resume and the target job.
*   **Interactive Display:** View the tailored resume (rendered as HTML) and the generated cover letter directly in the app.
*   **Downloadable Outputs:** Download your tailored resume and cover letter as styled HTML files, ready for review or further editing.

## How to Use

1.  **Select LLM Provider:**
    *   Use the "Choose LLM Provider" dropdown to select either Google Gemini, OpenAI, or Anthropic Claude.
2.  **Enter API Key & Model Name:**
    *   The configuration section for your selected LLM will appear.
    *   Enter your API Key in the designated field.
    *   The "Model Name" field will be pre-filled with a common model (e.g., `gemini-1.5-flash-latest`, `gpt-3.5-turbo`, `claude-3-haiku-20240307`). You can change this if you want to use a different model from that provider.
3.  **Upload Resume:**
    *   In the "Phase 1: Parse Resume to JSON" section, click "Choose File" and select your resume (.pdf or .docx).
    *   The application will extract the text and use the selected LLM to parse it into a JSON structure. This JSON will appear in the "Parsed Resume JSON (Editable)" textarea.
    *   You can manually edit this JSON if needed (e.g., to correct parsing errors or add missing information).
4.  **Paste Job Description:**
    *   In the "Phase 2: Tailor Resume & Generate Cover Letter" section, paste the full job description into the "Paste Job Description" textarea.
5.  **Generate:**
    *   Click the "Generate Tailored Resume & Cover Letter" button.
    *   The application will use the selected LLM to process your resume JSON and the job description.
6.  **Review Output:**
    *   The "Final Tailored Resume" section will display the AI-generated resume, rendered as HTML.
    *   The "Generated Cover Letter" textarea will show the AI-generated cover letter text.
7.  **Download:**
    *   Click "Download Resume (HTML)" to save the tailored resume.
    *   Click "Download Cover Letter (HTML)" to save the generated cover letter. Both will be saved as HTML files that attempt to use the application's styling.
8.  **Clear All:**
    *   Use the "Clear All & Start Over" button to reset all input fields, output areas, and clear stored API keys/settings from `localStorage`.

## Getting API Keys

You'll need an API key from the LLM provider you choose to use.

*   **Google Gemini:**
    1.  Go to [Google AI Studio](https://aistudio.google.com/).
    2.  Sign in with your Google account.
    3.  Click "Get API key" and follow the instructions to create a new API key.
    4.  A common model suitable for many tasks (and often with a free tier for initial usage) is `gemini-1.5-flash-latest`.

*   **OpenAI (ChatGPT):**
    1.  Go to the [OpenAI Platform](https://platform.openai.com/).
    2.  Sign up or log in.
    3.  Navigate to the "API keys" section in your account settings (usually found by clicking your organization or profile icon).
    4.  Create a new secret key. **Copy it immediately and store it safely, as OpenAI will not show it to you again.**
    5.  A popular and cost-effective model is `gpt-3.5-turbo`. More advanced models like `gpt-4` or `gpt-4o` are also available but typically incur higher costs.

*   **Anthropic Claude:**
    1.  Go to the [Anthropic Console](https://console.anthropic.com/).
    2.  Sign up or log in.
    3.  Navigate to "Account" (often in the top right or left sidebar) and then find the "API Keys" section.
    4.  Create a new API key.
    5.  A fast and capable model, often with a good balance of performance and cost (and sometimes a free tier), is `claude-3-haiku-20240307`. Other models in the Claude 3 family include `claude-3-sonnet-20240229` and `claude-3-opus-20240229`.
    6.  *Note:* The application automatically includes the required `anthropic-version` header (e.g., `2023-06-01`) for Claude API calls.

**Important Note on Free Models & Model Names:**
The model names provided above (e.g., `gemini-1.5-flash-latest`, `gpt-3.5-turbo`, `claude-3-haiku-20240307`) are examples of models often available with free introductory tiers or suitable for development purposes *at the time of this writing*. The availability, naming, and terms of free tiers can change frequently. Please always consult the LLM provider's official website, documentation, and pricing pages for the most current information on available models, their capabilities, and associated costs. The input fields in this application allow you to specify any model name compatible with the selected provider's API.

## ⚠️ Security Warning

**IMPORTANT:** This application stores your API keys in your browser's `localStorage`. `localStorage` is specific to your browser on your computer but is **not a secure vault for sensitive data** if:
*   You are using a shared or public computer.
*   Your browser has been compromised by malicious extensions or software.

For personal use on your own trusted computer, storing API keys in `localStorage` can be convenient. However, be aware of the risks. **Avoid using this application with your API keys on public or untrusted machines.** If you are concerned, use it only with temporary or restricted-use API keys, or clear your keys after each session using the "Clear All & Start Over" button.

## Technical Notes

*   This is a client-side (frontend-only) application built with HTML, CSS, and vanilla JavaScript.
*   It uses [pdf.js](https://mozilla.github.io/pdf.js/) for extracting text from PDF files locally in your browser.
*   It uses [Mammoth.js](https://github.com/mwilliamson/mammoth.js) for extracting text from .docx files locally in your browser.
*   All interactions with LLM APIs are made directly from your browser to the respective provider's servers. No backend server for this application is involved in processing your data or API keys beyond what your browser sends to the LLM.
