## OUTBREAK MANAGEMENT FUNCTIONAL REQUIREMENTS

1.0
2005-04-26

## Introduction

This document describes the Public Health Information Network (the product) functional requirements for systems implemented to participate in the management of outbreaks and other health events. Outbreak Management (OM) is the product functional area intended to support the needs of investigation, monitoring, management, analysis, and reporting of a health event or act of bioterrorism. OM should aid in the collection and analysis of data to support identifying and containing the health event. OM systems should be configurable to meet the needs of different types of health events, and capture data related to cases, contacts, investigations, exposures, relationships, clinical and environmental specimens/samples, laboratory results, vaccinations and treatments, travel history, and conveyance information. The application should also allow for new objects to be defined and created during the course of an investigation.
Central to the functionality of a system supporting OM is the ability to collect data related to cases and exposures and to create traceable links between all appropriate entities. By tracing the mechanism of transmission and identifying the source of the health event, the appropriate response staff can more effectively contain the event. Systems supporting OM should also be integrated with the systems supporting early event detection, countermeasure administration, laboratory, and surveillance to achieve the primary goal of managing the response to and mitigating the effects of an event.
This document provides minimum operational requirements necessary to support an outbreak management system and should in no way preclude a system from incorporating additional functionality beyond what has been covered in this document.

## OUTBREAK MANAGEMENT FUNCTIONAL REQUIREMENTS

The following requirements describe baseline functionality for any system(s) implemented to support Outbreak Management:

2.1 System Architecture: Broad system-level needs, such as flexible configuration, should be addressed by systems supporting OM.
2.2 Data Requirements: Systems supporting OM need a variety of data to support investigations, including data regarding demographics, cases, exposures, investigations, agents, contacts, specimen/sample collection, laboratory tests, travel and conveyance, and restriction monitoring.
2.3 System Functions and Behaviors: Systems supporting OM should support case investigation, maintain detailed and comprehensive linkages, trace contacts, and quarantine and isolation monitoring activities.
2.4 Analysis, Visualization, and Report Generation: Systems supporting OM should enable investigators to produce both aggregated and individual reports about affected entities and events.
2.5 System Integration and Data Exchange: OM information must be exchangeable, based on established standards, between systems involved in the investigation, identification, confirmation, and reporting of a health event.
2.6 Vocabulary Standards: Standard vocabulary lists and data structures have been defined by standards organizations. Where they exist, systems supporting OM should use them. As additional standards are defined, they should be accepted and implemented
2.7 Operations: Personnel, roles, activities, and responsibilities necessary to support all aspects of OM should be clearly defined.
2.8 System Security and Availability: Security of OM data includes the protection of data from corruption and access by unauthorized individuals, as well as the protection of the actual systems supporting OM from sabotage or other failure. A plan must be established for continuing activities when systems supporting OM are unavailable.
2.9 Privacy: Patients, organizations, and personnel must be protected from fraudulent and unauthorized use of their information.

## SYSTEM ARCHITECTURE

Systems designed to support OM must offer configuration flexibility so that new data fields, entities, entity types and relationship types may be added to capture information unique to each particular health event.

Systems supporting OM must support structured data entry for common forms and fields to ensure data integrity, validity, and standardization. A standardized data structure ensures that data mapping of common elements will only be necessary one time, rather than for each event.

Systems supporting OM should support multiple deployment options (e.g., client server, disconnected, and potentially web based).

Systems supporting OM should provide the ability for computers in disconnected mode to reconnect to a server to share OM data among other computers that operate in disconnected mode.

OM data should be synchronized so that all instances of OM applications working from the same server are able to share and use the same data.

Systems supporting OM should be able to electronically record and store data from remote devices that may be uploaded to an aggregating system.

Systems supporting OM should be capable of using configurable, domain-specific vocabulary.

## DATA REQUIREMENTS

The following high-level data requirements are necessary to ensure that the data being collected, analyzed, and reported to support OM are clearly defined.

## Entity Data

An entity is any being or object involved in a health event. Entities may be classified as a person, organization, location, animal, object, conveyance, event, or other organism. Each type of entity requires specific data to be collected.

Systems supporting OM must have the capability to capture demographic data about persons involved in an OM investigation, including: Subject ID, name, address, date of birth, gender, phone number, race, ethnicity, and country of citizenship.

Other descriptive details may be captured, such as occupation and work history.

Systems supporting OM must have the capability to capture data about organizations (e.g., a local health department, a university, a professional association) involved in an OM investigation, including: organization name, location, and contact information.

Systems supporting OM must have the capability to capture data about locations involved in an OM investigation, including: name (if applicable), type (e.g., floor, building, room, store), street address, city, state, zip code, country, GPS coordinates, and other specific details (e.g., a specific building on a campus, a business branch location, a local chapter’s meeting hall)

Systems supporting OM must have the capability to capture data about any animals involved in an OM investigation, including: type (dog, monkey, etc), age, gender, owner’s name and address, color, weight, and species. A Subject ID should also be collected for animals in an OM investigation. It may be a challenge to ensure unambiguous identification because demographic details of an animal are not easily identified; therefore, animals involved in investigations may need to be tagged.

Systems supporting OM must have the capability to capture data for any object involved in an OM investigation, such as a letter, invoice, food item, or any object that cannot be classified as a “person, organization, place, or animal.” Collected data may include: name of the object, type, physical descriptors, address, identification number (e.g. serial number, package slip number), and relevant dates and times (e.g., invoice date, shipping date, packaging date).

Systems supporting OM must have the capability to capture data about any conveyance involved in an OM investigation, including: type of conveyance, route taken (e.g., flight number), etc.

Systems supporting OM must have the capability to capture data about any public or private gathering of people (e.g., church social, ball game) involved in an OM investigation, including: time, location, nature of the event, etc.

Systems supporting OM must have the capability to capture data about any living things other than persons or animals that are involved in an OM investigation, including: type of living thing, and other customizable data collection questions.

Systems supporting OM must have the capability to capture an entity’s travel history to support investigations of entities infected, exposed or potentially exposed.

## Health Event Data

When a health event is investigated, it must be assigned an event identifier (i.e., Event ID) that is unique within the jurisdiction.

Data describing the health event should be captured, including the reason for the investigation, the category of event (e.g. environmental, infectious), the date the event began, the suspected agent (if known) or investigation focus, the geographic area impacted by the event, as well as the event status (e.g., open, closed).

Systems supporting OM should have the ability to record the case definition for a health event.

Systems supporting OM should have the ability to capture changes to the case definition that occur as the health event evolves.

## Travel History and Conveyance Data

Travel history provides specific information to indicate when, where, and how subjects involved in an event traveled to a location (or to multiple locations), and conveyance data describes the vehicle in which the travel occurred. Examples of travel history include a person’s local travel as a part of their daily activities as well as the shipment of animals or plants from one country to another.

Travel history data should include information such as the method of transportation (e.g. bus, plane, boat, car), flight number, departure and arrival dates and times, and the origination and destination locations (city, state, and country).

Information about each leg of a trip, as well as the parent information about the trip, should be captured. For example, if a person who lives in Georgia travels to Seattle and becomes exposed to monkey pox, then visits a friend in Santa Fe, travel history and conveyance data should be noted accordingly for each place the exposed person traveled.

Travel history data to be collected for an animal or object should include shipping invoices, animal shelter delivery and adoption receipts, and delivery schedules (including delivery vehicle and driver information).

Detailed conveyance data must be collected when relevant to the investigation, including the carrier identifier, the type of conveyance (such as airplane, bus, or train, among countless others), as well as the make, model, year, and identification number (e.g., VIN) of each vehicle with which the entity was in contact (if this information is relevant to the investigation).

## Case Investigation and Exposure Contact Data

Case and exposure data provide more detailed information beyond demographic data. Cases can be persons or animals, and exposure contacts can be persons, animals, other organisms, or exposure settings, such as travel conveyance, location, organization, object, or event.

Because attributes of both case and exposure data may describe the same entity, systems supporting OM must have the ability to avoid capturing redundant entity demographic information.

Public Health Case Data

Case data about the entity should include: a case identifier (i.e., Case ID) that is unique within the jurisdiction being reported, the suspected agent, case diagnosis, health status (e.g., no symptoms, acute illness), case status (e.g., confirmed, probable, suspect), investigation dates, clinical history, symptom onset date and time, epidemiological links to other cases, and priority (e.g., high, medium, low).

There must be a means to update the case diagnosis either manually or automatically if the case definition changes during an event.

Epidemiological (epi) data must be collected to assist in the case investigation of events. Standard epi data to be collected includes: onset date and time of symptoms, type of symptoms, risk factors, medical history data, laboratory data, procedure data, and questionnaire responses.

Systems supporting OM must allow for dynamic, event-specific case investigation data to be captured.

In the context of a case, all entities exposed to a case must be recorded and linked to the case.

Demographic information should be collected about the investigator, including their name, address, and contact information, so that the investigator may be contacted to answer questions or to provide additional information.

Both the jurisdiction investigating the event and the jurisdiction reporting the cases and associated investigations must be captured. For example, if a person becomes ill during travel in one jurisdiction but is the resident of another, the illness will be reported by the state (jurisdiction) of residence and investigated by the jurisdiction visited.

Systems supporting OM should have the ability to classify entities associated with the investigation as investigation controls. For example, controls share demographic characteristics with the subject of the case, but are not infected with the agent that is the focus of the investigation.

Exposure Contact Data

Exposure investigation data to be captured must include information related to exposure levels, type of exposure (e.g., intimate, social, household, common conveyance), place of exposure, length of time the entity was exposed, frequency of exposure, and the entity’s proximity to the source of exposure.

Detailed data must be collected about the source of exposure as well as the exposed entity to support contact exposure tracing. Exposure data related to both the potential source and the potential spread include the entity’s type, Subject ID, Contact ID, contact’s name and address, exposure dates and times, health status, and priority code.

Epi data must be collected to assist in the exposure investigation of health events. Standard epi data to be collected for exposure investigation parallels the data to be collected for case investigation and includes: onset date and time of symptoms, type of symptoms, risk factors, laboratory data, procedure data, and questionnaire responses.

Systems supporting OM must support capturing dynamic, event-specific data that describes contact between two subjects.

## Monitoring and Follow-up Data

Monitoring and follow-up data is used to track the progress and treatment of subjects who were exposed or potentially exposed to a health event. For more information about monitoring and follow-up data, please reference “the product Countermeasure/Response Administration Functional Requirements and Process Flows”, available at www.cdc.gov/phin.

Systems supporting OM should support the monitoring and follow-up activities required when tracking the status of cases and exposed individuals.

Monitoring data should be collected about cases and exposed individuals who are isolated or quarantined because of a health event.

Follow-up data should be collected from subjects or their proxies to track symptoms and compliance with recommended treatment plans or prophylaxis.

Follow-up data may be received from take response exams of persons who received a countermeasure that requires such an exam (i.e., smallpox vaccination).

## Specimen/Sample Collection and Laboratory Response Data

Specimen/sample collection and laboratory response data supports the collection of clinical specimens, food samples, environmental samples, and other types of samples that will be tested for biological, chemical, and radiological agents. These specimens/samples can be collected from places, persons, animals, or environmental sources such as air, water, food, or soil.

Specimens/samples collected for laboratory testing must be assigned an identifier (i.e., Specimen ID) that is unique within the jurisdiction.

The subject of a specimen/sample collected for laboratory testing must be linked to the specimen/sample by an identifier (i.e., Subject ID) that is unique within the jurisdiction.

Systems supporting OM must be able to store data about the specimens/samples that are collected for laboratory testing. Examples of this data are: Specimen ID, Subject ID, purpose for test, collection date and time, subject type (e.g., human, plant, animal, food), specimen category, specimen type, suspected agent, risk indicator (e.g., infectious, radioactive, corrosive), person performing specimen/sample collection (including contact information), location of collection, and volume and quantity details.

Clinical specimen data should include information about the specimen source/site from which the specimen was taken, symptom date of onset, and whether the sample is acute or convalescent.

Environmental sample data should include information about the collection method, location (geocoded if possible) from which the sample was taken, source (e.g., rain or well for water, radiation release, asbestos, chair or desk in a specified location), nature of the sample (e.g., soil, water, air), quality control data, collection begin and end date and time for air samples, and original volume and volume of concentrate tested for water samples.

Food sample data should include information about the lot number, batch number, manufacturer name, shipping invoice, temperature, sample type (e.g., dairy – milk, red meat, spice), and product storage condition.

Bar-coding should be supported for the capture of detailed specimen/sample data to improve the quality and efficiency of data collection.

Chain of custody information for all specimens/samples should be captured.

Chain of custody information for forensic and select agent samples must be captured, including the person who collected the sample, the location of collection, all people who came into contact with the sample during the preparation for shipment to the laboratory, and the acceptance of the package by the shipper.

Systems supporting OM must be able to create a laboratory test request for a specimen/sample or group of specimens/samples. More information about creating laboratory test requests is found in section 2.5 System Integration and Data Exchange of this document.

Information about batch shipments of specimens/samples that are transferred to test laboratories or other facilities must be collected, including the shipper (e.g., UPS, FedEx), shipment tracking number, and the sending organization’s contact information.

Systems supporting OM should be able to support the inclusion of labeling, packaging and shipping instructions (e.g., container type, storage condition, preservative), and the shipping manifest with batch shipments of specimens/samples.

Systems supporting OM must be able to store laboratory result(s) and link the result(s) to the original laboratory test request. More information about receiving and linking laboratory test requests is found in section 2.5 System Integration and Data Exchange of this document.

Systems supporting OM must store data about laboratory results. Examples of this data include the Specimen ID, Subject ID, test date and time, test type (LOINC), data for each organization involved in the testing of the specimen/sample (e.g., testing or reference laboratory name, location, contact information), laboratory results and result values (SNOMED), other data such as unit of measure for result value, overall interpretation, and any relevant notes.

If the specimen/sample collection record exists, the laboratory result must be linked to the specimen collection record by the Specimen ID.

If the specimen/sample collection record does not exist, the laboratory result must be linked to the subject by the Subject ID.

All levels of granularity of results (e.g., specimen/sample level, assay level) must be supported.

## Prophylaxis and Treatment Data
