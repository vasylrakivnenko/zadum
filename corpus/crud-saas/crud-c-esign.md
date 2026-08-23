## Overview

Fields are placeholders that recipients fill in when signing your document. You drag fields from the palette onto your document, position them where you want information collected, and assign them to specific recipients.

## Add a Field to Your Document

### Select a recipient

In the document editor, select the recipient you want to assign fields to from the recipient list in the sidebar. The selected recipient's color highlights which fields belong to them.

### Drag a field onto the document

Click and drag a field type from the field palette onto your document. Available field types include:

  Captures the recipient's legally binding signature
  Abbreviated signature for acknowledging pages or clauses
  Recipient's full name (auto-filled when available)
  Recipient's email address (auto-filled)
  Date the field was completed (auto-filled)
  Free-form text input
  Numeric input with optional validation
  Multiple selections from options
  Single selection from options
  Single selection from a menu

### Position the field

Drop the field where you want it on the document. You can drag it to reposition after placing.

  Each signer must have at least one Signature field assigned to them. The document cannot be sent
  without this.

## Assign Fields to Recipients

Fields are color-coded by recipient. To change which recipient a field belongs to:

    ### Select the field

    Click on the field to select it.

    ### Change the recipient

    In the field properties panel, change the **Recipient** dropdown.

    ### Confirm the assignment

    The field color updates to match the new recipient.

When you have multiple recipients, make sure each one has the appropriate fields assigned:

- **Signers** need at least one Signature field
- **Approvers** can have fields but don't require them
- **Viewers** cannot have fields assigned
- **Assistants** can pre-fill fields for other recipients

## Position and Resize Fields

### Moving Fields

Click and drag any field to reposition it on the document. Fields snap to help with alignment.

### Resizing Fields

Click a field to select it, then drag the corner handles to resize. This is useful for:

- Making signature fields larger for handwritten signatures
- Expanding text fields to accommodate longer input
- Fitting fields into existing form areas on your PDF

### Multi-Page Documents

Navigate between pages using the page controls. Fields placed on a page stay on that page. You can place fields on any page of your document.

## Configure Field Properties

Click on any field to open its properties panel. Available options vary by field type.

### Common Properties

  Property    Description

  Required    Recipient must complete this field to finish signing
  Read-only   Lock the field with a pre-filled value that cannot be changed
  Label       Text displayed above the field
  Font size   Size of text in the field (8-96px)

### Text Field Properties

  Property          Description

  Placeholder       Hint text shown when the field is empty
  Default value     Pre-filled text that recipients can modify
  Character limit   Maximum characters allowed
  Text alignment    Left, center, or right

### Number Field Properties

  Property        Description

  Minimum value   Lowest allowed number
  Maximum value   Highest allowed number
  Number format   Display format for the number

### Selection Field Properties (Checkbox, Radio, Dropdown)

  Property            Description

  Options             List of selectable values
  Default selection   Pre-selected option(s)
  Direction           Vertical or horizontal layout (Checkbox/Radio only)

For detailed information on all field types, see Field Types.

## Common Field Patterns

### Signature Block

A typical signature block includes the following fields:

1. **Signature**: Where the recipient signs
2. **Name**: Prints their full name below
3. **Date**: Records when they signed

Place these fields together at the bottom of your document or wherever signature lines appear.

### Terms Acceptance

For documents requiring explicit agreement to terms:

    ### Add a Checkbox field

    Add a **Checkbox** field with options like "I agree to the terms and conditions".

    ### Mark as required

    Mark the field as **Required**.

    ### Place near the terms

    Place it near the terms text.

### Information Collection

When gathering additional information from signers:

    ### Add Text fields

    Add **Text** fields for addresses, job titles, or company names.

    ### Add Number fields

    Use **Number** fields for quantities, IDs, or phone numbers.

    ### Add Dropdown fields

    Use **Dropdown** fields for selections like country or department.

    ### Set placeholders

    Set **Placeholder** text to guide what information you need.

### Multiple Signers

When you have multiple people signing the same document:

    ### Create signature blocks per signer

    Create separate signature blocks for each signer.

    ### Assign fields to recipients

    Assign each block's fields to the correct recipient.

    ### Verify with color coding

    Use the recipient color coding to verify assignments.

    ### Optional: enable signing order

    Consider enabling signing order if signers should sign in sequence.

## Edit or Delete Fields

Click on any field to select it and open its properties panel. Make your changes and they save automatically.

Select the field and press **Delete** or **Backspace** on your keyboard. Alternatively, click the delete icon in the field properties panel.

Select a field and copy it (**Ctrl+C** or **Cmd+C**), then paste (**Ctrl+V** or **Cmd+V**) to create a duplicate. This is useful when you need multiple similar fields.

---

## See Also

- Send Documents - Send for signing and start collecting signatures
- Create Templates - Save this field layout as a reusable template
- Field Types - Detailed configuration options for all field types

## Add a Recipient

### Open the document editor

You can access the document editor by clicking on a document in your Documents dashboard.

If you're uploading a document, you'll be redirected to the document editor after the upload is complete automatically.

### Click add signer

In the Recipients section, click **+ Add Signer** to add a new recipient row.

### Enter recipient details

Fill in the following information:

- **Email**: The recipient's email address (required)
- **Name**: The recipient's name (optional, but recommended for clarity)
- **Role**: What the recipient needs to do (see Recipient Roles)

## Recipient Information

### Email Address

The email address is where the recipient receives their signing invitation.

Make sure it's correct - once you send the document, the invitation goes to this address and cannot be changed.

### Name

Adding a name helps recipients identify themselves when they receive the document. The name appears in:

- The signing invitation email
- The document activity log
- The completed document's signature certificate

If you leave the name blank, the email address is displayed instead.

## Assigning Roles

Each recipient needs a role that determines what actions they can take:

  Role        What they do

  Signer      Must sign the document
  Approver    Must approve the document (signing is optional)
  Viewer      Must confirm they viewed the document
  Assistant   Pre-fills fields for other recipients
  CC          Receives a copy after the document is completed

For detailed information about each role, see Recipient Roles.

  The Assistant role is only available when sequential signing is enabled.

## Multiple Recipients

You can add as many recipients as you need. Click **+ Add Signer** for each additional person.

Common scenarios:

  Add yourself and the other party as signers.
  Add the main signer plus a viewer as witness.
  Add an approver first, then signers.
  Add CC recipients who receive the final document.

## Signing Order

By default, all recipients receive the document at the same time and can complete their actions in any order (parallel signing). You can change this to require recipients to act in a specific sequence.

### Parallel Signing (Default)

All recipients receive the document simultaneously. The document is completed when everyone finishes their required actions. Use this when:

- The order doesn't matter
- You want the fastest completion time
- Recipients are independent of each other

### Sequential Signing

Recipients receive the document one at a time, in the order you specify. Each person must complete their action before the next person is notified.

To enable sequential signing:

    ### Enable signing order

    Toggle on **Enable signing order** in the Recipients section.

    ### Set the order for each recipient

    Assign an order number to each recipient (1, 2, 3, etc.).

    ### Use the same number for parallel steps

    Recipients with the same order number act simultaneously at that step.

  Sequential signing is required to use the Assistant role. Assistants must act before the signers
  whose fields they pre-fill.

**Example workflow:**

  Order   Recipient          Role

  1       Admin Assistant    Assistant
  2       Department Head    Approver
  3       Contract Party A   Signer
  3       Contract Party B   Signer
  -       Legal Team         CC

In this example:

1. The assistant pre-fills information
2. The department head reviews and approves
3. Both contract parties sign at the same time
4. Legal receives a copy after completion

## Editing Recipients

You can modify recipient details anytime before sending the document:

- **Change email or name**: Click on the field and type the new value
- **Change role**: Select a different role from the dropdown
- **Change signing order**: Adjust the order number (if sequential signing is enabled)

  After sending a document, you cannot change recipients. If you need different recipients, you'll
  need to create a new document.

## Removing Recipients

To remove a recipient, click the delete icon (trash) next to their row. This also removes any fields assigned to that recipient.

You cannot remove recipients after the document has been sent.

---

## See Also

- Add Fields - Place signature, text, date, and other fields on your document
- Send Documents - Send for signing and monitor progress
- Recipient Roles - Detailed information about each role

## Overview

the product can suggest recipients and place fields automatically using Google Vertex AI (Gemini). The feature is optional and only available when your organisation or team has **AI Features** enabled. Documents are processed securely and providers do not retain your data for training.

## Requirements

- AI Features must be enabled in **Document Preferences** for your organisation or team.
- The envelope must be in **Draft** status.
- Helpful rate limits are in place (up to 3 detection requests per minute per IP) to prevent abuse. If you see a "too many requests" message, wait a minute or two and try again.

### Enable AI features

Go to **Settings** > **Document Preferences** > **AI Features**.

Set to **Enabled**.

_This applies to teams that inherit organisation defaults._

Go to **Team Settings** > **Document Preferences** > **AI Features**.

Choose **Enabled**, **Disabled**, or **Inherit**.

## Detect Recipients

Use this to identify who needs to sign or approve.

    Open a draft document or template and go to the **Recipients** panel.

    Select the **sparkle** button to start detection. If AI is enabled, uploads from the dashboard may open the detector automatically.

    Wait for progress to finish, then review the suggested recipients.

    Remove any incorrect entries, then click **Add recipients** to apply. Existing recipients and duplicates are preserved.

  Detection is unavailable once an envelope is completed. You can re-run detection if you update the
  document; each run counts toward the rate limit.

## Detect Fields

Use this to auto-place fields on the pages of a draft.

    Open the envelope editor and switch to the **Fields** tab.

    Select **Detect with AI**. Optionally provide context (e.g., "Alice is the tenant, Bob is the landlord") to improve recipient assignment.

    Watch the progress indicators (per page and total fields found).

    Review the summary and choose **Add fields** to place them in the editor.

  Works only for draft envelopes and teams with AI features enabled. Existing fields are masked
  during detection to avoid duplicates. Fields are assigned to recipients based on nearby labels and
  your context message; you can edit them after adding.

## Best Practices

    Place labels close to the intended fields (e.g. "Tenant signature", "Buyer email") to improve
    detection accuracy.

    Add brief context when recipient roles are unclear to help the AI assign fields correctly.

    AI assists but does not replace final checks. Review all suggestions before sending documents.

## See Also

- Add Recipients - Manually add recipients to documents
- Add Fields - Manually place fields on documents
- AI Features (Self-Hosting) - Configure AI detection for self-hosted instances

## Overview

the product allows you to set default recipients for your documents. This is useful when you require specific recipients to be added to every document you send.

You can add default recipients with the same roles as the recipients you can add when sending a document:

  The recipient will be required to sign the document.
  The recipient will be required to approve the document.
  The recipient will be required to view the document.
  The recipient will receive a copy of the document.

You can set default recipients at the organisation or team level.

### Organisation level

To set default recipients at the organisation level, navigate to the organisation settings page and click the **"Document"** tab under the **"Preferences"** section.

Then scroll down to the **"Default Recipients"** section and add the recipients you want to be included in every document you send.

The recipients are added with the **"CC"** role by default, but you can select a different role for each recipient.

### Team level

Setting the default recipients at the team level follows the same process as setting them at the organisation level.

  Setting the default recipients at the team level will override organisation-level defaults.

To set default recipients at the team level, navigate to the team settings page and click the **"Document"** tab under the **"Preferences"** section.

Then scroll down to the **"Default Recipients"** section. By default, the team will inherit the default recipients from the organisation. You can override these defaults by adding the recipients you want to be added to every document you send.

## See Also

- Add Recipients - Add recipients when sending a document
- Document Preferences - Configure other document defaults
- Recipient Roles - Learn about the different recipient roles

## Overview

The default document visibility option allows you to control who can view and access the documents uploaded within a team.

This value can either be set in the document preferences, or when you create the document

## Document Visibility Options

In **Default Document Visibility** (under document preferences), you can choose:

  All team members can access and view the document.
  Only managers and admins can access and view the document.
  Only admins can access and view the document.
  Use the organisation's default. Available for team-level settings only.

The default is Everyone. Change it in document preferences.

## How It Works

When you create a document, its visibility depends on your role and the team's default. Select your role:

New documents use the team's default visibility. You cannot change the visibility in the document editor.

**If the default is "Everyone" or "Managers and above":** New documents use that setting. You can change it in the editor to "Everyone" or "Managers and above" (not "Admins only").

**If the default is "Admins only":** New documents are admins-only. You cannot change it.

New documents use the team's default. You can change the visibility to any option in the document editor.

You can change visibility at any time by editing the document and choosing a different option.

  Updating the default document visibility in the team's general preferences will not affect the
  visibility of existing documents. You will need to update the visibility of each document
  individually.

## A Note on Document Access

The `document owner` (the user who created the document) always has access to the document, regardless of the document's visibility settings. This means that even if a document is set to "Admins only", the document owner can still view and edit the document.

The `recipient` (the user who receives the document for signature, approval, etc.) also has access to the document, regardless of the document's visibility settings. This means that even if a document is set to "Admins only", the recipient can still view and sign the document.

## See Also

- Document Preferences - Configure default document settings
- Team Members - Understand team member roles
- Send Documents - Send documents for signing



## Overview

the product can automatically detect placeholder text in your PDF documents and create fields at those locations. This allows you to prepare documents in your preferred editing tool (Word, Google Docs, etc.) with placeholders that become signature fields when uploaded.

## How It Works

When you upload a PDF, the product scans for text matching the placeholder pattern ``. Each placeholder can specify:

1. **Field type**: What kind of field to create (signature, name, email, etc.)
2. **Recipient**: Which signer the field belongs to (r1, r2, etc.)
3. **Options**: Additional settings like required, read-only, font size, etc.

The placeholder text is automatically hidden after fields are created, so your final document looks clean.

## Placeholder Format

The basic format is:

### Examples

  Placeholder                     Description

  ``             Signature field for recipient 1
  ``                  Name field for recipient 1
  ``                 Email field for recipient 2
  ``                  Date field for recipient 1
  ``   Required text field for recipient 1
  ``              Initials field for recipient 1

## Supported Field Types

The following field types are supported in placeholders:

  Field Type   Placeholder Value

  Signature    `signature`
  Initials     `initials`
  Name         `name`
  Email        `email`
  Date         `date`
  Text         `text`
  Number       `number`
  Radio        `radio`
  Checkbox     `checkbox`
  Dropdown     `dropdown`

  Field types are case-insensitive. `` and `` are equivalent.

## Recipient Identifiers

Recipients are identified using `r1`, `r2`, `r3`, etc. The number corresponds to the order in which recipients are created:

- `r1` - First recipient
- `r2` - Second recipient
- `r3` - Third recipient

When you upload a PDF with placeholders, the product will:

1. Create placeholder recipients for each unique identifier found (e.g., `r1`, `r2`)
2. You can then update these with real email addresses before sending

  Placeholders without a recipient identifier (e.g., `` without `r1`) are reserved
  for API use and will not create fields during upload.

## Field Options

You can customize fields by adding options after the recipient identifier:

### Common Options

  Option        Values                      Description

  `required`    `true`, `false`             Whether the field must be filled
  `readOnly`    `true`, `false`             Whether the field is pre-filled and locked
  `fontSize`    Number (e.g., `12`)         Font size in points
  `textAlign`   `left`, `center`, `right`   Horizontal text alignment
