##

## Software Requirements Specification (SRS)

## the product Connecting Retailers through the World

## the product

## the product Web Store

0.0

## Introduction

## Purpose

            This is the Software Requirements Specification for the product’s Web Store. This Web Store is designed to allow new online store owners a quick and easy means to setup and perform sales and other core business over the internet. This document will outline all of the functions, capabilities and requirements for Version 1 of the product’s Web Store. Version 1 is planned for implementation on a “plug and play” USB Key. Future versions will be based on other network appliances.

## Document Conventions

        None

## Intended Audience, Reading Suggestions

            This document is intended to flush out the requirements by the customer the product. The customer can review this document to ensure their needs along with the needs of their user’s are being met in their new Web Store program. The development team will also use this document for guidance on overall design and implementation of the Web Store system. The test and verification team can reference this to ensure the requirements are being meet for the customer. Finally, the tech writer will use this to assist with user documentation. This document is designed to be review from beginning to end; however, readers who are new to technical documentation may want to refer to Appendix E: Data Dictionary first.

## Project Scope

            According to the product’s Functional Needs Statement this Web Store will:

                Manage customer accounts
                Manage an online store inventory
                Confirm Orders
                Have an unambiguous interface to assist in browsing the categories and products
                Use Secure Socket Layer (SSL) for security
                Have an availability of 99.999
                Allow an optional mirror site for reliability and backups
                Feature interface for future software enhancement via “Plug-ins”

            The initial inventory will be 100 items. Expandable with unique codes, the owners can purchase to expand the inventory. The minimum total inventory will be 20,000 items. Since this will be a “Plug and Play device”, no software installation will be necessary. This software will contain all of the basic needs to manage an online store. Advanced needs can be added in the future via “plug-ins.” More detail on the functionality of the Web Store can be found in part 3. System Features and in the function Needs statement.

## References

        This document draws insight from the Web Store System Overview, Functional Needs Statement, and Stakeholder Goals List.

## Overall Description

## Product Perspective

            Web Store is a new system designed for users new to the online E-commerce. This will be a plug and play device with its own CPU and operating system. The Web Store will be a quick and easy means to setup and operate an online Web Store. The Figure 2.1 is a context diagram showing external system interfaces.

## Product Features

            Account Management (AM) (High Priority): AM allows users to create, edit, and view accounts information. It also allows the user to login/out of the system.
            Search Engine (SE) (Medium Priority): SE is the tool that assists the user in finding a specific item in the database. It can receive search criteria, find search criteria, and return the results of the search.
            Product Management (PM) (High Priority): PM allows sales personnel to manage the product line shown on the web site.
            Shopping Cart (SC) (Medium Priority): SC is temporary storage for customers shopping on the web. Items from the inventory can be reserved in a virtual cart until the customer decides to purchase them.
            Purchasing and Payment (PP) (High Priority): PP is used to approve and transfer payment from buyers when purchasing items in the cart.

## User Classes

            System Administrator: Is generally the owner that takes care of maintenance for the Web Store system. The administrator will be in charge of assigning privileges of accounts. Suggested more than one individual can have administrator privilege to ensure advisability. Full documentation will be provided to the Administrator to assist with this process.
            Sales Personnel: Is generally the owner of the Web Store tasked with updating inventory and product line descriptions. Once added, sales personnel can add, delete and change descriptions, pictures, prices, and when ready flag items for customers to buy.
            Customer: A customer is an individual wishing to purchase inventory from the product’s Web Store. The Web store will have a variety of clientele depending upon the inventory loaded on the Key. When creating a new account on Web Store it will default as a customer account. Later if the account needs to be upgraded the administrator can accomplish this via the administrator interface.

## Operating Environment

            Web Store shall operate with the following internet browsers: Microsoft Internet Explorer version 6 and 7, Netscape Communicator Version 4 and 5.

            Web Store shall operate on an Intel based system with Slackware Linux 2.6 and Apache Web Server. The operating system is designed by the Yoggie Corporation. Although maintenance documentation will be supplied and the operating system will be tested, the developers of this Web Store are not responsible for the functionality of the operating system.

             The system shall use SQL based database to store inventory information.

                USB interface and divers are provided by Yoggie Corporation.

## Design and Implementation Constraints

                Must use a SQL based database. SQL standard is the most widely used database format. Restricting to SQL allows easy of use and compatibility for Web Store.

                Compatibility is only tested and verified for Microsoft Internet Explorer version 6 and 7, Netscape Communicator Version 4 and 5. Other versions may not be 100  compatible. Also other browsers such as Mozilla or Firefox may not be 100  compatible.

## User Documentation

            Shall install online help for users via the web interface

            Shall deliver Operations and Maintenance manual, Users Guide book, and Installation Instructions for the Administrator.

## Assumptions and Dependencies

             Assume the delivery of development, test and evaluate samples of the USB system from Yoggie.

            Assume Yoggie will freeze the baseline of the USB system after delivery.

## System Features

## Customer Accounts

## Description And Priority

                Customers will be able to create accounts to store their profiles, contact information, purchase history, and confirm orders. This is a high priority system feature. Security methods will ensure that customer accounts remain confidential and resistant to tampering.

## Stimulus/Response Sequences

                    Web Browser initiates request to Web Server via HTTPS
                    Web Server parses request
                    Web Server submits request to Service
                    Service picks up request
                    Service runs task
                    Service returns results
                    Web Server checks for completion
                    Web Server returns results to Web Browser
                    Web Browser displays results

## Functional Requirements

            Customers will be able to create accounts to store their customer profiles, configure contact information, view their purchase history, and confirm orders. Customers will be able to register, log in, and log out of their accounts. Furthermore, Customer profiles will also include payment information, such as the ability to store credit card information, and address information.

## Inventory Management

## Description And Priority

            Inventory management will allow for the placement of products into multi-tiered categories. This is a medium priority system feature.

## Stimulus/Response Sequences

            Same as 3.1.2

## Functional Requirements

            Products will be stored in multi-tiered categories; a category can contain sub categories or products. The inventory management will allow for administrators to update the categories, the products placed in categories, and the specific product details.

## Shopping Cart

## Description And Priority

            Customers will be able to add and store products for purchase within the shopping cart. This feature is a medium priority system feature.

## Stimulus/Response Sequences

            Same as 3.1.2

## Functional Requirements

            Customers will also be able to add products into the shopping cart. The shopping cart will clearly display the number of items in the cart, along with the total cost. The customer will also be able to add to or remove products from the shopping cart prior to checkout and order confirmation.

## Order Confirmation

## Description And Priority

            Order confirmation will allow the customer to review their order after checkout prior to confirmation. This is a medium priority system feature.

## Stimulus/Response Sequences

                Same as 3.1.2

## Functional Requirements

                Customers will be able to confirm the order after checkout. If the order is incorrect, the customer will be able to revise and update their order. The customer will then receive a confirmation email with the specific order details.

## Interface

## Description And Priority

                The interface will be presented to the customer in a web browser. The interface must remain consistent among various web browsers and be intuitive to the customer. This is a medium priority system feature.

## Stimulus/Response Sequences

                Same as 3.1.2

## Functional Requirements

                Customers will be presented with an unambiguous interface to assist in browsing the categories and products. Customers will be able to search for products matching their search criteria. The interface will be compatible with all major web browsers such as Internet Explorer, Mozilla Navigator, Mozilla Firefox, Opera, and Safari.

## Interface

## Description And Priority

                The system will feature an API to allow customers to build custom plug-ins to be able to meet their needs. This is a high priority system feature as it ensures the flexibility of the system to be tailored to specific needs.

## Stimulus/Response Sequences

                    Web Browser initiates request to Web Server via HTTPS
                    Web Server parses request
                    Web Server submits request to API Service
                    API Service picks up request
                    API Service submits request to Plug-in
                    Plug-in picks up request
                    Plug-in runs tasks
                    Plug-in returns results
                    API Service validates results
                    API Service returns results
                    Web Server checks for completion
                    Web Server returns results to Web Browser
                    Web Browser displays results

## Functional Requirements

                The system will implement an Application Interface to allow for various plug-ins to interact with the system. The plug-in API will be well documented and specifications will be provided to plug-in developers.

## External Interface Requirements

## User Interfaces

        FIGURES

## Hardware Interfaces

            HI-1: USB key from Yoggie

## Software Interfaces

## SI-1: WebOrder Browser Interface

                    SI-1.1: The order database of WebOrder will communicate with the account system through a programmatic interface for the billing operations.
                    SI-1.2: Through programmatic interface, WebOrder will transmit information of items ordered by customers to the Inventory management system.
                    SI-1.3: Plug-ins interface

## Communications Interfaces

                CI-1: The WebOrder system shall send an e-mail confirmation to the customer that the items they ordered will be delivered to the shipping address along with tracking number.
                CI-2: The WebOrder system shall send an e-mail to System Administrator regarding any technical queries from customers or sales people.

## Quality Attribute Requirements

##

                Upon the USB being plugged in the system shall be able to be deployed and operational in less than 1 minute.

            The system shall be able to handle 1000 customers logged in concurrently at the same time.

             The system shall be able to retrieve 200 products per second.

            The system shall be able to add product to shopping cart in less than 2ms.

            The system shall be able to search for a specified product in less than 1 second.

             The system shall be able to email customer and vendor in less than 1 second.

             The system shall be able to validate credit card in less than 2 seconds.

             The system shall be able to acquire shipping charges in less than 2 seconds.

             The system shall be able to restore 1000 records per second.

## Safety Requirements

                The system will do periodic backups through a live internet connection.

## Security Requirements

                        The system shall validate credit cards against fraud.

                    The system shall encrypt all sensitive information via https.

                    The system shall encrypt all customer data in database.

                    The system shall auto detect IP DOS attacks and block IP automatically.

                    The system shall detect consecutive failed login attempts.

                    The system shall be protected by open source firewall called Firestarter.

## Availability Requirements

                        The system shall have an availability of 99.99 .

## Efficiency Requirements

                                The system shall perform searches via Dijkstra's shortest path algorithm.

                                For returning customers, the system shall validate 'existing' credit card in system
                                after each log in.

                            The system shall automatically compress image files that are too large in size.

                            The system will employ on demand asynchronous loading for faster execution of pages.

                            The system shall validate email address existence.

## Usability Requirements

                                The system shall be easy to use

                                The system shall be easy to learn

                                 The system shall utilize help bubbles to assist managers, customers, and administrators

                                 The system shall employ easy to locate buttons

                                 The system shall prompt customer with friend easy to read error messages.

                                The system shall utilize consistent symbols and colors for clear notifications.

## Maintainability Requirements

                                        The system shall utilize interchangeable plugins.

                                     The system shall be easily updatable for fixes and patches.

                                    The system shall create logs of all changes, updates, or fixes that are done to the site.

                                    The system shall be easy to upgrade.

## Portability Requirements

                                        The system shall be extremely portable via the usb drive.

                                        The system shall be easy to migrate or backed up via another usb drive.

## Testability Requirements

                                            The system should be able to run under debug mode.

                                             The system should be able to run test credit card transactions.

                                            The system should be able to run test shipping orders.

                                            The system should be able to create test environment of weborder system.

## Other Requirements

            The system hardware shall be fixed and patched via an internet connection.

            Yoggie shall coordinate on future enhancement and features with our
            organization.

        The system shall adhere to the following hardware requirements:

            4GB Flash ram chip
            128MB SDRAM
            Intel XScale PXA270 520-MHz chipset
            OS: Apache web server
            Database: MySQL

## Glossary

            Plug and play:

            Plug and play is a computer feature that allows the addition of a new device, normally a peripheral, without requiring reconfiguration or manual installation of device drivers.

        SDRAM:

        Short for Synchronous DRAM, a type of DRAM that can run at much higher clock speeds than conventional memory. SDRAM actually synchronizes itself with the CPU's bus and is capable of running at 133 MHz, about three times faster than conventional FPM RAM, and about twice as fast EDO DRAM and BEDO DRAM. SDRAM is replacing EDO DRAM in many newer computers.

        Actor:

        A person playing a specific role, a software system, or a hardware device that interacts with a system to achieve a useful goal.

        Alternative course:

        A path through a use case that leads to success, but involves a variation from the normal course in the specifics of the task or of the actor’s interaction with the system.

        Assumption:

        A statement that is believed to be true in the absence of proof or definitive knowledge.

        Business requirement:

        A high- level business objective of the organization that builds a product or of a customer who procures it.

        Business rule:

        A policy, guideline, standard, or regulation that defines or constrains some aspect of the business.

        Cluster Server:

        Servers work together as one machine to provide increase availability of applications.

        Constraint:

        A restriction that is imposed on the choices available to the developer for the design and construction of a product.

        Context diagram:

        An analysis model that depicts a system at a high level of abstraction.

        Customer:

        A project stakeholder, who requests, pays for, selects, specifies, uses, or receives the output generated by a product.

        Data Dictionary:

        A collection of definitions for the data elements, structures, and attributes those are important to the problem domain.

        Data flow diagram:

        An analysis model that depicts the processes, data collections, terminators, and flows among them that characterize the behavior of a business process or of a software system.

        Documentation Writers:

        Writers are able to take technical complexities and turn them into simple, understandable text. They will expertly produce the documentation products needed such as user manuals, Installation guides.

        Developers:

        One who programs computers or designs the system to match the requirements of a system analyst.

        Feature:

        A set of logically related functional requirements that provides a capability to the user and enables the satisfaction of a business objective.

        Flowchart:

        A model that shows the processing steps and decision points in the logic of a process or of a program, similar to that of an activity diagram.

    Functional requirements:
