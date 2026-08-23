the product is an open-source (AGPLv3) survey platform built to collect feedback from anyone—users, customers, or employees—on any platform.

With the product, you can replace many existing survey tools:

- **Standalone surveys (share via link):** Replace Google Forms, Typeform or any other link survey tool with the product Form Builder. Use lots of question types and comprehensive customizations.

- **Scalable website surveys:** Even if you have millions of website visitors, the product lets you run well-timed and anonymously targeted surveys on any public website.

- **Highly targeted app surveys:** Identify known users with the product and enrich their profiles with attributes and specific actions. Build cohorts for highly targeted in-app surveys.

The survey platform is **mostly free, even for commercial use**. Over time, all survey features will stay part of the free Community Edition.

## An end-to-end XM Suite

the product covers the full experience-management loop — from collecting feedback to acting on it — in one platform:

    Collect feedback with link, website, and in-app surveys built in a powerful, fully customizable builder.

    Unify feedback from every source into one store, then visualize it with charts and shareable dashboards.

    Turn responses into action with Workflows that trigger emails and other automations — no code required.

### the product – The Experience Management (XM) Suite

To support the development of our open-source platform, we’ve created a premium offering: the **the product XM Suite**.

- **What is XM?**
  Experience Management (XM) involves collecting, analysing, and reporting feedback from stakeholders (like customers or employees) to understand and improve their experience with your organisation.

- **Why XM Matters**
  Helping businesses, governments, and nonprofits understand their users' experiences leads to better services and happier people. the product XM provides the data needed to make decisions that put people first.

- **How XM Works in the product**
  the product XM simplifies experience management. It focuses only on what’s needed to measure specific experiences, with easy-to-use templates, reports, and best practices.

We have spent a lot of time and energy building out the open-source survey platform which powers the above. Stick around to see how the product XM Apps will empower everyone to think and work human-centric.

Try the product Cloud ☁️

## Terminology

* **Condition**: A rule that determines when an action should be executed.

* **Action**: A task that is executed when a condition is met.

## **Creating Logic**

* **Add a Logic Block**: Click the `Add logic +` button to add a new logic block.

  You can add multiple logic blocks to a survey. Logic blocks are executed in
  the order they are added. You can rearrange the order of logic blocks.

* **Add Conditions**: Add conditions to the logic block. Conditions are rules that determine when an action should be executed.

Conditons can be based on:

* **Question**: The answer to a question.

* **Variable**: A variable value.

* **Hidden Field**: The value of a hidden field.2.a **Condition Options**: Choose from a list of available conditions.

* **Condition Operators**: Choose an operator to compare the condition value.

* **Condition Value**: Enter a value to compare the condition against.
  Comparisons can be made against a fixed value or a dynamic value.
  Dynamic values can be based on a question, variable, or hidden field.

  Conditions can be grouped. Conditions can be combined using AND or OR
  operators. You can add multiple conditions to a logic block. Conditions are
  evaluated in the order they are added.

* **Add Actions**: Add actions to the logic block. Actions are tasks that are executed when a condition is met.

  You can add multiple actions to a logic block. Actions are executed in the
  order they are added.

* **Action Options**: Choose from a list of available actions.

Action is of the following types:

  * **Calculate**: Perform a calculation. These variables are then available for use in other questions.

    * Calculations can be performed on variables.

    * Calculations can be based on fixed values or dynamic values.

  * **Require Answer**: Make a question required. Only the optional questions can be marked as required while filling the survey.

  * **Jump to Block**: Skip to a specific block. The user will be redirected to the specified block based on the condition.

* **Save Logic**: Click the `Save` button to save the logic block.

## Block Logic

This logic is executed when the user reaches the block. Logic can be as simple as showing a follow-up block based on earlier answers or as complex as calculating a score based on multiple answers.

- **How to**: Open the Survey Editor, switch to the Settings tab. Scroll down to **Response Options**, and toggle the **“Close survey on response limit”**.

- **Details**: Set a specific number of responses after which the survey automatically closes.

- **Use Case**: Perfect for limited offers, exclusive surveys, or when you need a precise sample size for statistical significance.

## **Understanding Partial Submissions**

Partial submissions occur when respondents start a survey but do not complete it. These can include instances where the survey is opened but no questions are answered, or where only some questions are addressed before the survey is exited.

## **Enabling and Accessing Partial Submissions Tracking**

Tracking of partial submissions is automatically enabled for all the product surveys, capturing every interaction from the moment a respondent begins the survey.

### **Types of Data Captured**

1. **Display Created**: Tracks when a survey is initially opened.

2. **Questions Partially Answered**: Records after every question & the data is handled, noting which questions were last interacted with before the survey was exited.

### **Benefits of Tracking Partial Submissions**

- **Identifies Drop-Off Points**: Pinpoints specific questions where respondents are likely to stop answering, providing critical insights into potential issues within the survey.

- **Improves Survey Design**: Data from partial submissions can guide adjustments to question complexity, survey length, or formatting to enhance respondent engagement.

- **Enhances Completion Rates**: Understanding where and why respondents are dropping off allows for targeted interventions to improve overall engagement and completion rates.

## **Analyzing Partial Submission Data**

the product provides detailed analytics for partial submissions, including a per-question analysis of respondent behavior.

### **Survey Summary Analytics**

The "Analyze Drop-Offs" toggle in the survey summary reveals a comprehensive table with detailed metrics, enabling a deep dive into how respondents interact with each question:

- **Summary Metrics**:

  - **Impressions**: Total number of times the survey was viewed.

  - **Starts**: Percentage of impressions that the survey was started.

  - **Responses**: Total number of completed responses.

  - **Drop-Offs**: Percentage of starts that did not lead to a complete response.

  - **Time to Complete**: Average time taken by respondents to complete the survey.

### **Detailed Question Analysis**

Each question is analyzed for:

- **Time to Complete**: Average time taken by respondents spent on this question.

- **Impressions**: Number of times the question was viewed.

- **Drop-Offs**: Number of times respondents left the survey at this question, with a percentage indicating the drop-off rate.

This data is invaluable for pinpointing problems with specific questions and understanding the overall flow and engagement levels within the survey.

## **Use Cases**

Partial submissions tracking is particularly valuable for:

- Surveys experiencing high drop-off rates, where detailed question analysis can inform necessary adjustments.

- Studies requiring in-depth engagement metrics for each survey question to optimize content and survey structure.

## **Conclusion**

By leveraging the partial submissions tracking feature in the product, you gain comprehensive insights into respondent behaviors and survey interactions. This information is vital for enhancing survey design, improving response rates, and ensuring more reliable and meaningful data collection.

## Overview

Quota Management allows you to set limits on the number of responses collected for specific segments or criteria in your survey. This feature helps ensure you collect a balanced and representative dataset while preventing oversaturation of certain response types.

  Quota Management is part of the Enterprise Edition.

### Key benefits

- **Balanced Data Collection**: Ensure your survey responses are evenly distributed across different segments
- **Cost Control**: Prevent collecting more responses than needed from specific groups
- **Quality Assurance**: Maintain data quality by avoiding homogeneous response patterns
- **Automated Management**: Automatically stop collecting responses when quotas are met

### How Quota Management works

When you set up quotas for your survey, the product automatically tracks responses against your defined limits. Once a quota is reached, the system can:

- Prevent new responses from that segment
- Skip respondents to the end of the survey
- Redirect respondents to a custom end screen

## Setting up Quotas
In the first step, you need to define the criteria for the quota:

    Create a Quota and label it e.g. "Mobile Phone Users in Europe"

    Set numerical limits for each hidden field value combination e.g. 500

    Choose a distinct set of answers to survey questions, variable values or hidden fields. Responses who match this set will be included in the quota.

    Choose what happens when this Quota is met (e.g. skip to specific end screen)

## Quota actions
Configure what happens when a quota reaches its limit:

    Jump respondents directly to the survey completion page

    Redirect respondents to a custom thank you page or alternative survey

## Counting against Quotas

### 1. Count by Hidden Field value

Determine if a response falls in or out of a Quota based on hidden field values passed through URL parameters:

### 2. Quota by survey responses

Create quotas based on specific answers to survey questions:

    Set quotas for individual answer options:
    - Question: "What is your gender?"
    - Quota: 500 responses for "Male", 500 responses for "Female"

    Combine multiple question responses:
    - Criteria: Age group "25-34" AND Location "Urban"
    - Quota: 200 responses matching both criteria

### 3. Multi-criteria quotas

Create complex quotas using multiple conditions:

### Partial vs. complete responses

  By default, Quota Management includes partial responses in quota counts. You can change this behavior by configuring the quota to only count complete responses.

This means if a respondent starts but doesn't complete the survey, they may still count toward your quota if they've answered the qualifying questions.

## Quota monitoring

  Monitor your quotas in real-time through the dashboard in the survey summary:

  - **Current Count**: See how many responses each quota has collected
  - **Progress Bars**: Visual representation of quota completion
  - **Status Indicators**: Active, completed, or paused quota status

How to deliver a specific language depends on the survey type (app or link survey):

- App & Website survey: Set a `language` attribute for the user. Read this guide for App Surveys

- Link survey: Add a `lang` parameter in the survey URL. Read this guide for Link Surveys

---

## Creating a Multi-language Survey

    Go to Configuration and open the **Survey Languages tab**:

    Click on the **Edit languages** button to add a new language to your survey.

    Select the preferred language from the dropdown and assign an identifier Alias. Click the **Add language** button to add the language to your Workspace:

    You can come back to this page anytime to add more languages or remove existing ones.

    Return to the dashboard to create a new survey or edit an existing one:

    In the survey editor, scroll down to the **Multiple Languages** section at the bottom and enable the toggle next to it:

    Choose a **Default Language** for your survey.

    Changing the default language will reset all the translations you have made for the survey.

    Add the languages from the dropdown that you want to support in your survey:

    You can now see the survey in the selected language by clicking on the language dropdown in any of the questions.

    Now you can translate all survey content, including questions, options, and button placeholders, into the selected language.

    Once you are done, click on the **Publish** button to save the survey.

---

## Built-in Interface Translations

Beyond the content you translate yourself, every survey ships with a set of built-in interface strings that the product localizes automatically — so respondents see them in their own language without any extra work from you. These include:

- Default navigation and action buttons (**Back**, **Next**, **Finish**)
- Form validation messages (e.g. "Please fill out this field", "Please enter a valid email address")
- File-upload prompts and states
- Offline, retry, and "sending responses" notices
- Attribution and helper labels like "Powered by" and "Required"

These built-in strings are currently provided in **23 languages**:

  Language   Code   Language   Code

  English (base)   `en-US`   Italian   `it-IT`
  Arabic   `ar-EG`   Japanese   `ja-JP`
  Chinese (Simplified)   `zh-Hans-CN`   Portuguese (Brazil)   `pt-BR`
  Chinese (Traditional)   `zh-Hant-TW`   Romanian   `ro-RO`
  Danish   `da-DK`   Russian   `ru-RU`
  Dutch   `nl-NL`   Spanish   `es-ES`
  Estonian   `et-EE`   Swedish   `sv-SE`
  French   `fr-FR`   Turkish   `tr-TR`
  German   `de-DE`   Urdu   `ur-PK`
  Hindi   `hi-IN`   Uzbek   `uz-UZ`
  Hungarian   `hu-HU`   Vietnamese   `vi-VN`
  Indonesian   `id-ID`

the product matches the survey's active language to the closest available bundle — for example, `de-AT` and `de` both use the German bundle, and `pt-PT` uses `pt-BR`. Writing script is preserved when matching, so `zh-Hant` and `zh-TW` resolve to the Traditional Chinese bundle rather than the Simplified one. If a language has no matching bundle, your translated survey content is still shown as usual, but these built-in interface strings fall back to English.

  Don't see your language? These interface translations live in the open-source `@the product/surveys` package. You can add a new one by contributing a locale file on GitHub.

---

## App Surveys Configuration

    After you setup the product SDK for your user, you can call the `setLanguage` function with the language code. This can be either the ISO identifier or the Alias you set when creating the language. The `language` attribute makes sure that this user only sees surveys with a translation in this specific language available.

      If a user has a language assigned, a survey has multi-language activated and it is missing a translation in
      the language of the user, the survey will not be displayed.

    That's it! Now, users with the language attribute set will see the survey in their preferred language. You can start collecting responses in multiple languages and filter them by language on the summary page.

---

## Link Surveys Configuration

For link surveys, the translation delivery is dependent on the `lang` URL parameter.

    After publishing the survey, just copy the survey link and append the `lang` query parameter with the language alias you have set.

    For example, if you have set the alias for French as `fr`, you can share the survey link as

    `

    Here are two examples:

    - English:

    - German:

    Without the `lang` parameter, the product will show the survey in the default language you have set.

    You can now start collecting responses in multiple languages!

---

## Translate with AI

Translating every question, option, and label by hand can take a while. If your organization has AI enabled, you can fill in missing translations in one click.

    Inside the survey editor, switch to the language you want to translate into and open the **Manage Translations** modal.

    The button is enabled when there are empty fields in the selected target language. the product translates all empty headlines, descriptions, choices, and button labels from the default language into the target language.

    AI-translated strings are filled into the editor like manual translations. Review them before publishing and tweak anything that needs a different tone or wording.

  AI translation is an Enterprise feature and requires **Smart functionality (AI)** to be enabled at the organization level. See AI Features.

---

## RTL Language Support

the product fully supports Right-to-Left (RTL) languages such as Arabic, Hebrew, Persian, and Urdu. When you add an RTL language to your survey, the survey interface automatically adjusts to display content from right to left.

### How RTL Support Works

- Text alignment automatically switches to right-to-left
- Survey layout and UI elements adjust to RTL orientation
- Button placement and navigation flow adapt to RTL reading direction
- Form elements maintain proper RTL formatting

### Setting Up RTL Languages

    Add an RTL language (like Arabic or Hebrew) in the **Survey Languages** settings

    Create translations for your survey content in the RTL language

    The survey will automatically display in RTL format when that language is selected

---

**Need help?** Reach out in Github Discussions

## How to Add Hidden Fields

### Enable Hidden Fields

1. Edit the survey you want to add hidden fields to & switch to the Questions tab and scroll down to the bottom of the page. You will see a section called **Hidden Fields**. Make sure to enable it by toggling the switch.

### Add Hidden Field IDs

1. Now click on it to add a new hidden field ID. You can add as many hidden fields as you want.

## Set Hidden Field via URL

Single Hidden Field:

Multiple Hidden Fields:

## Set Hidden Fields via SDK

  We are reworking how to add Hidden Fields via SDK moving away from binding them to Actions over to Context. Until then, we will **continue to support the current approach for the JS SDK**. However, we don't support Hidden Fields for the Android and iOS SDKs.

## View Hidden Fields in Responses

These hidden fields will now be visible in the responses tab just like other fields in the Summary as well as the Response Cards, and you can use them to filter and analyze your responses.

## Use Cases

- **Tracking Source**: You can add a hidden field to track the source of the survey. For a detailed guide on Source Tracking, check out the Source Tracking guide.

- **User Metadata**: You can add hidden fields to capture user metadata such as user ID, email, or any other user-specific information.

- **Survey Metadata**: You can add hidden fields to capture other metadata, e.g. the screen from which the survey was filled, or any other app specific information.

By adding validation rules to your questions, you can improve data quality, reduce errors, and create a better survey experience.

## How Validation Rules Work

Validation rules are evaluated when a respondent submits their answer. If the answer doesn't meet the validation criteria, an error message is displayed and the respondent must correct their input before proceeding.

You can combine multiple validation rules using **All are true** or **Any is true** logic:
- **All are true**: All rules must pass for the response to be valid
- **Any is true**: At least one rule must pass for the response to be valid

## Available Validation Rules by Question Type
