## Software Requirements Specification for the product Password Safe

1.10
2008-02-17
0

## Introduction

## Purpose

This document includes software requirements for the product Password Safe, release number 1.10. the product Password Safe is an OSI Certified Open Source Software distributed under the terms of the GNU General Public License Version 2 or under. The system gives resolution to memorizing passwords problem. Its purpose is to keep all of the user’s passwords, data, email accounts, usernames and URLs stored in a very
secure, encrypted database, protected by a Master Password. The system is very small so it can be easily transferred from one computer to another. It provides several functionalities on the already encrypted data and the new ones to be inserted. The database produced, is protected by a Master Password only known by
its inventor with no backup if lost.

## Document Conventions

· When writing this document it was inherited that all requirements have the same priority.
· First there is presented an overall view about the product and then all features and functions are
analyzed in detail.

## Intended Audience and Reading Suggestions

This requirement document contains general information about the product, main classes and use cases, functions, features and special technologies. It describes in detail all that the product needs to work properly and with safety.
The rest of the document is divided into chapters for better understanding.

In chapter 2 an overall description of the product is provided. First product perspective is presented with product features and main functions. Then follow user classes and characteristics, operating environments that the product supports as well as design and implementation constraints. After all that user documentation is presented and will provide you with more details about each feature’s technology.
In chapter 3 most important features are presented with detailed description, use cases and requirements.
In chapter 4 user and communication interfaces are described.
In chapter 5 requirements about safety and performance are presented.

This document is intended for
Developers: in order to be sure they are developing the right project that fulfills requirements provided in this document.
Testers: in order to have an exact list of the features and functions that have to respond according to requirements and provided diagrams.
Users: in order to get familiar with the idea of the project and suggest other features that would make it even more functional.
Documentation writers: to know what features and in what way they have to explain. What security technologies are required, how the system will response in each user’s action etc.
Advanced end users, end users/desktop and system administrators: in order to know exactly what they have to expect from the system, right inputs and outputs and response in error situations.

## Project Scope

the product Password Safe is a small system that can be easily transferred from computer to computer by a simple USB stick. Its purpose is to solve a problem that really bothers many people today when they have to choose from memorizing a lot of passwords to be secure or to use every time the same one so they won’t forget it but risk be found out by others. So it provides you a very secure, encrypted database where you can keep inside all your passwords, usernames, email accounts, URLs, notes without any risk for others to find them. That is because the product Password Safe can lock every database with only one Master Password and/or key file. There are no duplicates, anywhere in your computer, of this Master Password and/or key file so in case of lost database cannot be opened by anyone. Not even by you and that is because there is no recovery password or back door.
the product Password Safe beside security also provides you with several functionalities in order to keep your database organized and up to date. Those are analyzed in the following pages.
More about the product you can find out at

## References

More about the product can be found at

In this website you can find out more about the project and discuss any questions in the forums. You can go back and look at previous releases, code and problems that have been solved. There you can also find information about the developers as well as the project’s main characteristics such as programming language and algorithms

This is project’s official website where you can find links to all above and also find features
available for downloading such as language translations and plug-ins.

## Product Perspective

the product consists of a database which contains data for one or more users. Each user’s data are divided into groups and subgroups so that they are organized in a form that serves right the user. Every user has a unique Master Key which can be simple or composite and its combination opens uniquely the database. If lost there
is no recovery. Groups and subgroups contain entries with usernames, passwords URLs etc that can be sent or copied to websites, application and accounts. There is also the ability for a onetime key creation to be used once in a transaction without the risk of reused by others for any reason.
In the diagram below there are the main components of the system, subsystem interconnections and external interfaces to help you understand the main idea of the product. All of them are analyzed with more details in this document.

## Product Features

the product Password Safe provides the user with the following functions:

Database – New, Open, Close, Save, Print, Search, Import, Export
User can create a new database locked by a Master Key. The database can be opened and closed whenever user wants it. Changes on the data are permitted and the changes can be saved. The user also can print all data in order to keep them with him even when a computer is not available. Also the user can search the database using key words through a search engine provided with the software. Last but not least, the database can be imported and/or exported from/to the Internet.
Group/Subgroup – Add, Modify, Delete, Find
Data are organized in groups and subgroups in the order that user wants and finds effective.
Those groups can be modified whenever. New groups and subgroups can be added easily and can be deleted the same way. The feature of searching can be applied in just one group and not in the whole database if wanted.
Entry – Add, View/Edit, Duplicate, Delete
A new entry can be added in any group or subgroup and it contains title, username, password, URL and notes. Not all fields are required for an entry. An entry can be duplicated and deleted in the click of a button.
Change Language
At the product website there are available language translations that can be downloaded and applied easily.
Auto-Type
The user can select a sequence of keypresses that the product will be able to perform and send them to any window or browser.
Command Line Options
The user can pass a file path in the command line in order for the product to open this file at startup.
Composite Master Key
To open a database you must use all key sources such as password, key file and/or Windows account details that were used when the Master Key was created. All these together form the Composite Master Key and are all required in order to open the database. So the user cannot use a combination of them to unlock the database.
Configuration
This feature is used to explain how the product store its configuration and where.
· Import/Export
the product can support importing data from CSV files, Code Wallet, Password Safe and
Personal Vault.
Integration
the product uses Global Hot Key to restore the product main window and Limit to single instance option to run only one instance of the product at a time.
Password Generator
There are available generations based on character sets and based on patterns the first for generating random passwords and the second for creating passwords which require specific patterns. There is also available generating passwords that follow rules which are
determined further down on this document. Then there are security-reducing options which reduce the security of the passwords they are applied to. Finally there are configuring
settings of automatically generated passwords for new entries so that a random password will automatically be created by the product when a new entry is wanted.
Secure Edit Controls
the product offers the ability for passwords and data to be appeared behind asterisks when the user wants it. When this option is turned on, secure edit controls stronger than the ones of Windows are protecting your data and no one can access them, see them or steal them.
TAN Support
the product uses TAN-Transaction Authentication Numbers for even more security. This
feature can be used for generating one time passwords so that there won’t be any chance, for anyone to access e.g. your bank account even if he finds out that password. That is because when the password is entered one time it becomes useless. TANs can be added using the TANs wizard.
URL Field
The URL field supports various special protocols and placeholders and can be used for
Standard capabilities where URL field can execute valid URLs for which a protocol handler is defined. In addition to that, the product supports all registered protocols that Internet Explorer supports. URL field also offers the ability of executed command lines instead of URLs. Also, placeholders can be used that will be automatically replaced when the URL is executed.
Using Stored Passwords
Passwords that are stored in the database can be copied to website accounts and applications with security and without retyping them again. This can be done by several methods such us Context-Sensitive Password List, Drag and Drop, Auto-Type and KeeForm. All of them are explained better further down.
Lock Workspace
Last but not least at all is the locking workspace feature. This feature is turned on and locks the database when minimized. So to unlock it the Master Key is required again. The workspace can be locked manually as well by selecting this option from File menu.

## User Classes and Characteristics

Advanced end users: users that are familiar with programming and can personalize their database by creating auto-types, using command line options and generally can use features and maybe expand their use by adding more functions.
End users/Desktop: users with no particular knowledge on computer programming. They just use the database for organizing their data and to keep them safe.
System administrators: administrators working on computers that support a lot of accounts and personal data for other users. Using the product the administrator can save all data with no risk of leak to third persons.
Science/Research Telecommunications: for organizing data that have to do with lots of people and applications
Industry: for one-time passwords that can be used for testing controls or for expired entries to gain access in particular systems and programs.
Other Audience

## Operating Environment

the product should run on Operating Systems: WINE, 32-bit MS Windows (95/98), 32-bit MS Windows (NT/2000/XP), All 32-bit MS Windows (95/98/NT/2000/XP),Win2K, WinXP, Microsoft Windows Server 2003.
The user interfaces used are: NET/Mono, Win32 (MS Windows)
All new releases contain Filename Architecture Type
the product-1.x-Setup.exe i386 .exe (32-bit Windows)
the product-1.x-Src.zip Platform-Independent Source .zip
the product-1.x.zip i386 .zip
and release notes witch describe what has changed and what has been added.
Nothing more than these is required for a fully functional the product.
the product should run perfectly on older releases without any features limitations or data loss.

## Design and Implementation Constraints

Timing requirements in the product Password Safe:
When a password is copied for any reason, (e.g. copy to an application, account, and website) it remains in the memory for only 10 seconds. After 10 seconds pass there is nothing to paste and you have to recopy again. That provides security in a case a password is copied and not pasted anywhere so no one can find it out by pasting later.
Language Requirements in the product Password Safe:
Not in all translations translated help files and tutorials are available.
Specific Technologies used in the product Password Safe:

In order to keep the user’s data fully protected, 2 very secure algorithms are used:
Cipher Block Size Key Size Advanced Encryption Standard (AES / Rijndael) 128 bits 256 bits Twofish 128 bits 256 bits In both algorithms every time the user saves a database, a random 128-bit initialization vector is generated.
For the creation of the 256-bit key the Cipher uses, the Secure Hash Algorithm SHA-256 is used.
All the bytes needed for the Initialization Vector, the master key salt, etc are generated via pseudorandom sources: current tick count, performance counter, system date/time, mouse cursor position, memory status, active window focus handles, window message stack, process heap status, process startup information and several system information structures.
When the product is active, all passwords are stored encrypted in process memory so in order for them to be completely safe the ARC4 encryption algorithm is used, using a random 12 bytes long key.

## User Documentation

By downloading the product Password Safe, the user also gets:

A compiled HTML Help file with a tutorial and full help on all features provided
A the product Internet shortcut which take the user in the system’s official website where are available downloads, translations, plug-ins and extensions.

## System Features

System features are organized by use cases and functional hierarchy so that the main functions of the system will be understandable.

## New Database

This feature provides the ability to create a new database

## Description

It is the first thing a user must do to begin using the product. Its main function is the determination of the master password that will unlock the database from now on

## Stimulus/Response Sequences

Data Flow

## Basic Data Flow

User opens the product and select New->Database
User writes his private Master Password and/or selects Key File
User selects OK
Master Password confirmation: the user retypes Master Password
The main database window opens

## Alternative Data Flows

## Alternative Data Flow 1

User selects Help
The help file opens

## Alternative Data Flow 2

User selects Cancel
Exit from the product

## Alternative Data Flow 3

The user does not determines a Master Password
A message is appeared which prompts him to enter a password or key file

## Functional Requirements

REQ-1: the product must be downloaded and installed

REQ-2: Master Password has no limits in length. A whole sentence can be used with more than 100 characters.

## Open Database

This feature allows the user to open an existing database.

## Description

When choosing to open a database a user is transferred to his documents where he navigates to find the database he wants. When the database is found, the master password is wanted so that the database will be unlocked. Once this is done the user is free to access his data.

## Stimulus/Response Sequences

Data Flow

## Basic Data Flow

User opens the product and select Open->Database
User navigates through his folders
User selects a database
User types Master Password
The main database window opens

## Alternative Data Flows

## Alternative Data Flow 1

User selects a type of folder non suitable for database
A message “file not found” appears
User selects another folder

## Alternative Data Flow 2

Master Password is wrong
A message “invalid/wrong key” appears
User types another master key

## Alternative Data Flow 3

User chooses cancel
Exit from the product

## Functional Requirements

Folder selected must be of type the database can read and that is “name”.kdb

## Save Database

This feature allows the user to save any changes or updates he has performed to his database.

## Description

When a database is opened, the user can access his passwords, organize them into new
groups and subgroups, delete and add entries and so much more. But when it is time for the database to close or during his working on the database, he can save the changes made.

## Stimulus/Response Sequences

Data Flow

## Basic Data Flow

User opens the product and changes his data
User selects save database
Database is saved
User exits the product

## Alternative Data Flows

## Alternative Data Flow 1

User selects save as
User gives a new database name
New database is saved and opens with the same master password

## Alternative Data Flow 2

User continues working after he saves the database

## Alternative Data Flow 3

User wants to exit the product
A message is appeared asking if he wants to save the database
User selects yes and exits, or no and exits or cancel and return to database

## Alternative Data Flow 4

Users minimizes the database
A message is appeared asking if he wants to save the database before locking

## Functional Requirements

Databases must have different names or else the previews one will be replace if selected

## Print Database

This feature allows user to print a selection of data that are stored in the database.

## Description

While working on the database, the user has the option to print data from his database. This can be done by selecting print. When this happens, a list of data types that can be printed are shown and the user can select the data to be printed. More specifically fields that can be selected for printing are: Backup entries, which contain entries in the back up group, password groups, group tree, title, username, password, URL, notes, creation time, last access, last modification, expires, icon, UUID and attachment.

## Stimulus/Response Sequences

Data Flow

## Basic Data Flow

User opens the product
User selects print from file menu
The list of options opens with checked the fields: password groups, title, user name, password, URL, notes
User selects OK
Data are print
User returns on the main window

## Alternative Data Flows

## Alternative Data Flow 1

3a. User selects some more fields and/or unselects some others.

## Alternative Data Flow 2

User unselects all fields
An empty report is printed

## Alternative Data Flow 3

User selects Cancel
User returns on the main window

## Functional Requirements

There must be entries in the database in order for them to be printed

## Search Database

This feature allows user to search for keywords in his database.

## Description

There is the ability to search in the database for usernames, groups, passwords, URLs, notes and titles. This is very useful when the user needs to find out very quickly which password is required in one account or what username he has put on another account. It is not necessary to write in the search field all characters. By writing just one character the database will present all data which contains it or are related with it.

## Stimulus/Response Sequences

Data Flow

## Basic Data Flow

User opens the product
User types a password, user name, URL, word of notes, title or group that exist in the database
The list of data related to search word are appeared in the main window

## Alternative Data Flows

## Alternative Data Flow 1

User types two or more words in the search field
Nothing appears in the main window

## Alternative Data Flow 2

User does not type anything
Nothing appears in the main window

## Alternative Data Flow 3

User types part or even just one character of password, user name, URL, word
of notes, title or group

## Alternative Data Flow 4

User types data not related with the database
Nothing appears in the main window

## Functional Requirements
