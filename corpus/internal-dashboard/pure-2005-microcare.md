## Software Requirements Specification For Voucher Management System

1.0

## Introduction

## General overview of the product (Voucher Maintenance Unit System)

System Development:
The system will be developed on Oracle 9i platform Front end will be VB
(visual basic) Reports will be crystal reports 9

System design:
The system will be user friendly with maximum master table structure with
all transaction screens to have drop down selection menus to minimize data entry errors.
The main data entry screen on claims entry to have drop drown menu from patient’s profile
selection to medicine cost to have drop down. Minimize the use of key board for any number
entry to have a faster transaction data entry. The system will be easily trainable for the user
with minimum computer skill with simple user step by step manual.

Storage efficiency:
The structural design of the database will have sequential links with surrogate
keys. The database storage will be highly efficient to manage and avoid empty unused spaced
blocked, properly defragmenter on a periodic basis. This efficiency will have a maximum
provision to expand this program beyond the pilot period,
if the program requirements remain same.

Security:
High intrusion controls will be in place in the system and the database.
Access level controls, various organizational level user setting
by including granular model setting.

External Hardware interface:

Bar-code –
 the system will interface with the bar-code reader to interface all transaction
details. E.g. voucher number verifications, claim form entry and
selection of voucher usage by the clients.

Bio-metrics – the system will interface with the thumb-print reader for verifying claims form
used by the clients.

## Functional Flow Diagram:

## Purpose

The purpose of this document is to explain the flow and the requirement
of Voucher Management System (VMU) required by Marie Stopes International Uganda
(MSIU) during the various meetings held between MSIU and the product from 28th of Nov
2005 to 30th of Nov 2005. This document is purely based on the Functional Flow Diagram
designed by the product. The document will explain every small
entity of the system including various code generations, Bar-coding and Graphical User
Interface etc. This document will help the system development team to understand the
overall and detailed functions of every small entity in VMU and to design the system that
will meet every requirement of the VMU program.  This document will help the testing team
to prepare the Test Cases and will help them to test every module in the system and overall
testing of the system, so that the testing team will have confidence on the quality of this
system.

## Project Scope

## about MSIU and OBA Program

Past experiences with development aid showed, that financing inputs,
e.g. facilities and equipment, does not result in the necessary improvement of health
outcomes. Thus as a change of paradigm, the OBA concept finances agreed outputs
with predefined quality rather than pre-defined inputs by selling vouchers for STD
services at subsidised prices to patients. These vouchers will be refunded to service
providers in the private sector (medical doctors, qualified nurses and midwives),
government hospitals, NGOs, and faith-based organisations.
The major advantages of the OBA approach are, that it allows

To target resources to address selected health problems,
To target the provision of services to specific parts of the population and
To stimulate private market initiative and competition.

The approach was successfully applied in the sixties/seventies in South
Korea and Taiwan. In recent years also a programme was run in Nicaragua but the OBA
has not been
implemented in larger scale programs.

Quality health care services for STD treatment,
For the sexually active population of the Mbarara district,
Through a voucher system,
By qualified, approved providers,
For a pilot phase of 1 year.

The principles of the voucher, the contents of the health care services,
their required quality, the standards to be met by the providers and their infrastructure,
as well as the measures for monitoring the
quality have been defined in the PDS.

The main structures and processes in the STD voucher programme are:

The programme is prepared, implemented and managed by the Voucher
Management Unit (VMU).
The VMU establishes a network of approved providers (during the pilot phase private,
 NGO, FBO providers)
throughout Mbarara District.
The VMU runs a marketing and behavioural change campaign (BCC) to market and inform about the
 voucher services and how to use them.
The VMU establishes and runs a distribution system with the purpose
 to distribute the STD vouchers to the sexually active population for which the
above-mentioned providers are in reach.

Distribution follows certain rules:

The vouchers are packed in two with one voucher for the purchaser of the voucher,
in the following addressed as “client”
and one for the partner of the client.
The voucher may only be bought for personal treatment or for the treatment
of the partner. Only one voucher is sold at time. The option of selling more than one
voucher
to a person at a time introduces too many sources for fraud.
Distributors keep a distribution list documenting distributor, voucher number,
date, place of sale, and
name and place of living of the customer.

The client may honour the voucher at any approved provider of his choice.
STD treatment according to the National Treatment Algorithms for STD in Uganda (NTA),
adapted for this voucher scheme (TA-OBA, treatment algorithms for STD treatment in the
OBA scheme),
is given to clients for free for the syndromes of

Urethral discharge
Abnormal vaginal discharge
Genital ulcer
Inguinal bubo
Ophthalmia neonatorum
Acute scrotal swelling
 Pelvic inflammatory disease

In line with the NTA the voucher includes

First consultation with basic lab testing and treatment
First follow-up visit for all clients. If symptoms persist drug regimen will be switched
 If necessary second follow-up visit. If symptoms persist referral to a hospital.
Provider documents each voucher case in a standardised patient
treatment documentation form.

At the end of each month they hand in – respectively the claims processing
agency (CPA) collects –

The voucher for each patient
Copyright
The standardised patient treatment documentation form for each
patient and
A summary claims form containing a summary of all treated voucher cases to
the VMU for reimbursement.
The data from the forms is entered into a computer database. Data checks and
 plausibilisations are done.
Clean claims will be reimbursed via bank transfer.
Conspicuous claims will be investigated and cleared by the VMU.
The VMU operates a monitoring system including follow-up with patients
to monitor proper operation of the voucher scheme.

## About Voucher Management system

The voucher management system VMS is designed to atomize
the process of Voucher Management Unit (VMU) to minimize the manual process
to maximize the quality of the project to understand the
progress and timely out come of the project to take necessary steps by the MSIU
Admin team to plan for the future and to increase the quality of the STD voucher
service. The system will also control the existence of fraud in claims and will help
 the service provider to reach their payments in time without delay.
The other features and details of system will be explained in below sections in the
document.   The voucher management system is subdivided into following modules to
make the system easy for understanding, developing, testing and to implement.

Voucher Creation / Preparation
Marketing / Sales
Claim Entry / Processing
Voucher Sales Return
Client Feed back
Reports (Standard and Customized)
Security and User Privileges

Each of the above modules are again subdivided into subsystems, those details are explained in
below sections in the document

## References

The preparation of SRS is purely based on the following documents

 Final report on Programme Design Study, Dated 10-Sepetember-2005 Prepared by MSIU
Functional Flow of the product Prepared by the product on 30th November 2005.

## Overall Description

## System Perspective

This section of the document is going to explain the functionalities of
the system, its subsystems and how it’s integrated and working together.
During the system study, it was understood that the first pilot period, twenty
thousand vouchers will be sold, but the VMU-system has the provision to upgrade to meet
the additional market and projects needs.

## Outline of entire system

The VMU will create the vouchers and sell it to clients through distributors
The distributor will submit the sales details back to the VMU.
Each voucher should have two portions with three tear off voucher slips each
for Client and Partner.
The client and/or the partner will choose the service provider and will get treatment
First visit is called as Consultation and if the patient is not cured then they can go
for first follow
up and second follow up,
If the patient is not cured then the doctor will refer the patient to some other
Hospitals the hospital may be
another VSP or any other.
Each visit details (including Diagnosis, Lab Test and Drugs) of the patient is
called a claim,
The VSP will submit the claim to VMIU field office to enter those into the database,
The filed office will validate the claim form manually and through system,
If any of mandatory information is missed or any false information is existing
then the field office will reject the claim back to VSP and
the system will keep those claim in a quarantine area
The quarantined forms will be sent back to the VSP for verification, if the VSP
returns the claim with satisfactory details, the claims will be entered on to the system,
in the following month’s batch.
Based on the payment terms agreed by VSP, the field office will generate
BiMonth or Monthly financial and medical report and send it to MSIU Admin team to arrange
the payments for the VSP.
To understand the satisfaction of client the MSIU Admin team will get client feedback
from some of the clients and send those documents
to field office to enter those into database.

As mentioned above the entire system is sub-divided into six modules
and again the each module
is subdivided into different subsystems.

## 2.1.2 Voucher Management System Modules

## Voucher Creation / Preparation

Voucher creation – the voucher numbers are system generated
and created with unique identification numbers with security protocols in-built.
The created unique numbers are then printed out in the form of bar-codes, which will
complement (or stuck on the voucher) the voucher. Then at every level on the voucher
cycle this number is captured, on distribution, retail sales, point of treatment, enclosed
along with claim forms, at the claims processing and finally for the payment.
Such tracking records will be utilized for reports as well. Each voucher should have the
following properties, which will have sub-elements to get the batch numbers, voucher
numbers, and the project codes. Project code – Group batch code – Batch number –
Voucher number – Security code.

Project Code (2 Digit) Example: P001
Group Batch (3 Digit) each group batch has a batch of 100 Batches Example: GP0001
Batch number (2 Digit) approximately each batch will have 10 vouchers
Voucher number (10 digit)
Security Code
All codes will be printed out in the form of Bar
Additionally the provision for validity date check for the period of vouchers to be
used in the program is provided. This validity date can be amended or altered at the
system level ONLY by the authorized user
Voucher will also have MRP (maximum retail price)
Voucher should have three tear off portioned slips with a sub-section tear-off for
the partner.
If the tear off voucher slips would be sticker then it will not be lost on attaching to
the claim
forms by the VSP.
Each voucher slip should contain the bar code of the Voucher with two
identifications one for the client and
the other for the partner.
The first tear for the first consultation
Second one for the first follow-up
And the third tear off for the final (second follow-up).

This system has high security feature as far as the user access to the
system, including all the modules,
sub-modules and even at the screen level.

The voucher will be created ONLY by the authorized person.
The will be a provision to create a minimum quantity of vouchers at one time
(such minimum numbers will
be decided by the management team).
Once created vouchers will not be edited or deleted but there will be a provision
to with-hold any voucher number if the admin
team decides to do for any reason.
There will be a provision to amend the validity date of the voucher.

## Marketing / Sales

The marketing and sales is the next step and the next module in the system.
This module will take care of following sub modules.

## Distributor Master Information

The system will capture the master details of every distributor so that
the users can get the details of any distributor and sales details at any time. Each
distributor will have unique code and detailed descriptions such as name, address,
locations and type of business etc. such valid information will help us track
information related to sales and distributions.
Following fields will be captured at this master.

Distributor Code (3 Digit) Example: DS0001*
Name of the distributor*
Type of business (e.g. hospital/pharmacy/NGO)*
Proprietor Name*
Designation
Address (Street/Road, Sub District, County, Sub County and Village or Town)*
Contact No
Email Id
Status (active/deactivate)

All fields with * are mandatory!

The address field will capture the geographical location of the distributor,
such as District, Sub-District, County, Sub-County or Village / Town, road or street. All
the level of details will have a master table in order to update as per the program
requirements.
The system will check the duplicated ID for the distributors. The system can allow
the duplicate names of the Distributor. On capture of any duplicate name the system
will give a warning message to have the duplicate name or to change the name.
For better reporting purposes it is better to have a differentiating indicator on the name.
System will have a provision to print the distributor master details.
The distributor screen will have a provision to view the Sales History of a
particular distributor with following summary details.
Distributor Name as Report Header and following as the report footer

Batch No
Date of purchase
Qty Purchase
Qty Sold
Qty Returned
Balance Qty (any other details required by the MSIU office)

There will be a provision to select a particular distributor to view the details
(e.g. sales) by double clicking on the grid.
Print option of above report is based on User Login Permission only.
There will be an option for doing the following at every screen.

New
(adding new records)

Edit
(updating available records)

Delete
(deleting will be allowed only if no child records are created)

Active/Deactivate
 (if the distributor has to be deactivated or terminated)

There will also be a provision for the other users to view the details of a
 distributor with purchase and sales details.

The system will capture the details of MSIU Salesman; this would help
the MSIU management team to understand the performance of each Team or salesman.
During every distribution transaction the user should select the name of the sales man
listed from Team Master.
The Salesman master should capture following information’s.

Salesman Code*
Name of the Salesman*
DOB   Age*
Gender*
Communication Address*
Contact No
E-Mail Id
Sales-team (which will have a separate master)*.

The sales team master is for the future development of this program,
if this program is extended to a country-wide network,
this master will help understand and tack sales information.

The system will check the duplicated ID for the salesman and team.
The system can allow the duplicate names of the salesman. On capture of any duplicate
name the system will give a warning message to have the duplicate name or to change
the name. For better reporting purposes
it is better to have a differentiating indicator on the name

## Distribution Transactions (Sales from MSIU to Distributor)

The system will capture the details of voucher sales between MISU
sales team and Distributors. During the distribution the system will capture the
following details, to make Distribution process easily. With the below details the
user can get the details of Distributor-wise and Salesman-wise
and Batch No wise sales details as reports.

Name of the distributor*
Name of the Sales Man*
Date of distribution*
No of vouchers sold*
According to the number of vouchers required by the distributor,
the system should allocate the relevant vouchers with their
numbers and batch numbers based on the stock.
Invoice amount = No of vouchers x Wholesale price
Mode of payment is Cash

The mandatory information required during a distribution transaction is
mentioned below.

Name of the distributor (Selecting from Distributor Master)
Name of the Sales Man (Selecting from Sales man master)
Date of Distribution (Date selection option)
Required Qty (No of vouchers sold (Allow only Numeric Entry))
Invoice Amount = Whole Sale Rate (should taken from settings master based on sale date)
* Qty Sold. (Automatic Calculation)

The system will generate an auto-generated number as Distribution
Invoice No.
Suppose the distributor or salesman name is not available in the system, then the
system has a provision to navigate quickly to its master screen and enter the new
Distributor and Salesman details,
without closing the present screen.
While entering the No of vouchers required, the system should automatically
pick the Batch No’s with voucher No’s from the available voucher stock and list the
details of each voucher with below information’s as a grid format.

Batch No
Voucher No
Validity Date

The date of distribution will be current (system) date. But the date of sale
can be the past dates.
There will be a future date sale validation check available.

## Claim Entry/Processing

The program will take maximum care in this form and table, as it
become a vital transaction to be captured. In this module you will see that every
capture of data will be
validated and checked on saving into the database. For e.g. the capture of voucher
number, clinical information, diagnosis details, drug and investigation details and
the costs are going to provide the program a vital report information. The system
development team will focus its attention in making this module/table function
efficiently.  For the easy understanding and designing of the system, this module is
subdivided into following sub-modules. The division of sub-module is purely based
on the sub-level categories of the data information.

The service (treatment) will happen at the VSP (Service Provider) clinic or hospital
The attending doctor will fill the claims form.
On completion of the service the patient will provide the voucher according
to the visit type and patient type (client or partner),
the voucher will be stuck to the claim form.
The thumb print will also be placed on completion of the service
The VSP will send the collected claim forms monthly and send it to MSIU field office.
MSIU office will then process the claim.

## Voucher Service Provider (VSP) Master Information

The VSP master will have the following information:
