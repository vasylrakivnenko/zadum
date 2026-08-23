## the product The Energy Management System SOFTWARE REQUIREMENTS SPECIFICATION

1
1998-10-14
D_THEMAS_SRS_001

## None

## Introduction

The following subsections of Section 1.0 provide an overview of
the entire Software Requirements Specification.

## Purpose

This Software Requirements Specification (SRS) specifies the
qualification requirements for The Energy Management System
(the product). It provides a technical description of all so ftware
requirements of the system, provides traceability of software
capability requirements to the Statement of Work, and identifies
external interfaces. This document is intended for use by the
Design Requirements team, Principle Software Architect, and other
parties interested in the development and progression of the product.

## Scope

The scope of this document is confined to only the software
requirements for the product system. Only those conditions
expressed with the imperative "shall" are to be interp reted as
binding requirements for this SRS. This document provides a
detailed definition of all requirements for the product system. It
does not provide a detailed definition of the exact systems that
will interface with the product. The SRS shall give a prototype of a
simulated thermostat for verification and validation of the product
reliability. The requirements specified in this document are to
be used as the basis for software design of the product system.

## Definitions, Acronyms, and Abbreviations

The following section lists acronyms and abbreviations and their
meaning as used in this document:

ANSI American National Standards Institute
C Cooling
DB Database
DD Data Dictionary
DFD Data Flow Diagram
H Heating
IEEE Institute of Electrical and Electronic Engineers
LO Lower Overtemperature Value
LT Lower Trigger Value
OD Overtemperature Delta Value
SDD Software Design Document
SRS Software Requirements Specification
T Current Temperature Value
TD Trigger Delta Value
the product The Energy Management System
TSET Current Temperature Setting
UT Upper Trigger Value
UO Upper Overtemperature Value

## References

The following documents shown form a part of this specification.
In the event of conflict between the documents referenced and the
contents of this SRS, the contents of this document shall
overrule all others, with the exception of the Statement of Work.

Statement of Work THEMAS_SOW_001
ANSI/IEE Guide to Software ANSI/IEEE STD 830-1984
Requirements Specification

Technical society and technical association specifications are
generally available for reference from libraries. Copies of other
specifications may be obtained from Barry Scott, the product project
Manager.

## Overview

This document is prepared in accordance with the American
National Standards Institute (ANSI) / Institute of Electrical and
Electronics Engineers (IEEE) Guide to Software Requirements
Specifications, ANSI/IEEE STD 830 -1984. Section 2.0 of this
document gives a general description of the product system. I t
provides product perspectives, product functions, user
characteristics, general constraints, and assumptions and
dependencies of the system. Section 3.0 contains all the details
the Design Requirements team needs to create a design. It will
contain functional and performance requirements, design
constraints, attributes and external interface requirements for
the product system.

Appendix A contains the Dataflow Diagrams.
Appendix B contains the Traceability Matrix.
Appendix C contains the Data Dictionary .

## None

## General Description

This section of this SRS describes the general factors that
effect the product system and its requirements. This section does
not state specific requirements, it only makes these requirements
easier understood.

## Product Perspective

the product system is a system that operates independent of any
other system, or any components of the heating and cooling system
to which it is attached. the product system, however, is composed
mainly of a hardware and software portion. This SRS only
specifies the requirements dealing with the software portion of
the system. If assumptions or dependencies about the hardware
were made, they are stated in this section of the SRS.

## Product Functions

the product system is divided into four major sections: Monitor
Temperature, Determine Utilization, Initialize System, and System
Reports. All four sections have an associated software
configuration item; all except the System Reports have an
associated hardware configuration item. The hardware
requirements are contained in the system specification. The
functions of the software for the system are contained in the
following paragraphs.

## Monitor Temperature

The monitor temperature function receives the valid temperature
and system parameters. The function then goes through the
process of determining temperature status. After this process is
done, either temperature limit is exceeded or the temperature
change is requested. If the temperature change is requested,
then the determine heating/cooling mode process is activated and
makes a heating/cooling request. Some other processes that help
the monitor temperature function are: validate temperature,
change thermostat setting, generate alarm, and system
initialization.

## Determine Utilization

The determine utilization function receives the heating/cooling
request and utilization parameters. The function then processes
the status of all heating/cooling units and sends out either unit
unavailable or heating/cooling unit needed. The fun ction
generates either a unit unavailable event which goes into the
System Reports function or it generates a heating/cooling signal
to turn on/off the units. The Monitor Temperature and Initialize
System functions help the determine utilization to do its
processes.

## Initialize System

The initialize system function receives the initialization data
for the product system. The processes that are associated with it
are: load heating/cooling unit definitions, turn off all
heating/cooling units, load th ermostat definitions, load
utilization parameters, set trigger values, set overtemperature
values, and establish valid temperature range. The outgoing
information that starts the entire the product system is: clear all
heating/cooling signals, send thermostat definitions, send
utilization parameters, send trigger values, send overtemperature
values, and send valid temperature range.

## System Reports

The system reports function receives event data from the product
system. This function is a database that stores all the events
in the product system. This function is mainly for the use of
the supervisor of the product system to maintain an efficient
heating and cooling system. The only process that interacts with
the system reports function is the generate event data process.

## User Characteristics

This system is intended to be used by people that maintain the
heating and cooling systems in a building. The system should not
need intervention from outside users other than the supervisor to
maintain operation of the product. The system should provide warnings
to the supervisor about faulty temperatures. The displaying of
the current status of the system to the supervisor should not
contain excessive information which could confuse the supervisor.
The system should provide information in the form of reports to
the supervisor so that the system can be run efficiently.

## General Constraints

The general constraints of the product system focus on the
functionality provided by the external devices connected to i t.
The thermostats shall only provide temperature values and
temperature settings. The heating and cooling units provide no
feedback to the product system. When a signal is sent to a
heating or cooling unit, no signal shall be available to allow
the product system to determine if the signal sent to the unit was
realized by the unit.

## Assumptions and Dependencies

In developing the requirements for the product system, several
assumptions have been made about the thermostat hardware and the
heating/cooling hardware. These assumptions are stated in the
following paragraphs.

## Operating System Assumptions

the product system shall be designed to run on the Microsoft ®
Windows NT™ operating system. All the internal process
communications shall be designed to operate on this operating
system. Any communication with the thermostats and heating and
cooling units shall be done through the interface to these units.
These interfaces shall run on this operating system as well.

## Thermostat Hardware Assumptions

It is assumed that the thermostat is capable of returning the
current temperature and the current desired temperature setting
to the product system. The thermostat is constantly returning
these values with no real time delay in between the thermostat
and the product system. The thermostat also has the capability of
being set and controlled by a user of the product system.
All data sent by the thermostat is in the correct format for the
the product system to use.

## Heating/Cooling Hardware Assumptions

It is assumed that the heating/cooling unit is incapable of
returning its current off/on status to the product system. The
heating/cooling unit has no real time delay when sending these
statuses to the product system. The heating/cooling unit shall
have the capability of being turned off and on by the supervisor
of the product system.

## Engineering Requirements

## Functional Requirements

This section is subdivided into ten main subsections: Initialize
Operational Parameters, Initialize System, Validate Temperature,
Monitor Temperature, Determine Utilization, Generate H/C Signal,
Generate Alarm Data, Generate Event Data, Change Thermostat
Setting, and Generate Reports. Each subsection describes the
software requirement for that individual software component of
the product system.

## Initialize Operational Parameters

The following sections describe the Initialize System component
of the product system.

## Load H/C Unit Definitions (SRS -001)

## Introduction

the product system shall control t he heating and cooling units
that are defined as part of the product system. The definitions
of the individual heating and cooling systems reside in an
initialization file. The system shall read this file and the
definitions shall be derived from the initialization data in the
file.

## Inputs

Initialization Data

## Processing

the product system shall use the information contained in the
initialization data file to determine which heating and cooling
units are part of the product system. Ther e is one heating and
cooling unit that corresponds to one thermostat in each of four
quadrants on each of three floors of the office building.

## Outputs

Operational Parameters

## Load Thermostat Definitions (SRS -002)

## Introduction

Each thermostat shall have a unique identifier by which that
thermostat is identified in the product system. This procedure
will load these definitions into the product software.

## Inputs

Initialization Data

## Processing

Each quadrant of each floor shall have a thermostat which is to
be used to provide temperature data to the product system. The initialization file shall contain a unique identifier for each
thermostat that the system is to monitor. These identifiers
shall be read from the initialization file and loaded into the
the product system during the initialization process.

## Outputs

Operational Parameters

## Load Utilization Parameters (SRS -003)

## Introduction

There shall be a maximum number of heating or cooling u nits that
can be on at any given time. This procedure loads the maximum
number of concurrently running units allowed.

## Inputs

Initialization Data

## Processing

The maximum number of heating or cooling units that can run
concurrently shall reside in an initialization file. The maximum
number of concurrently running units shall be read from the
initialization file and stored in the product system.

## Outputs

Utilization Parameters

## Set Trigger Values (SRS -004)

## Introduction

The trigger value is used in combination with the current
temperature to determine when a heating or cooling unit shall be
turned on or off.

## Inputs

Initialization Data

## Processing

The trigger values shall reside in an initialization file. This
procedure shall read the initialization file and establish the
trigger value from the data in that file.

## Outputs

Operational Parameters

## Set Overtemp Values (SRS -005)

## Introduction

the product system shall ensure the temperature reported by a
given thermostat shall not exceed a maximum deviation value of 3
degrees Fahrenheit.

## Inputs

Initialization Data

## Processing

The overtemperature values shall reside in an initialization
file. This procedure shall read the initialization file and
establish the overtemperature value from the data in that file.

## Outputs

Operational Parameters

## Establish Valid Temperature Range (SRS -006)

## Introduction

the product system shall only respond to temperatures that are
within a reasonable value.

## Inputs

Initialization Data

## Processing

The valid temperature range value shall reside in an
initialization file. This procedure shall read the
initialization file and establish the valid temperature range
from the data in it.

## Outputs

Operational Parameters

## Initialize System (SRS-007)

## Introduction

When the product system is initialized, it shall first turn off
all the heating and cooling units. Then , it shall check all the
thermostats and determine if any thermostat’s settings require a
heating or cooling unit to be turned on back on.

## Inputs

Operational  Parameters

## Processing

This process shall first determine a known state of all the
heating and cooling units by issuing a request to turn off all
the units. It shall then read the current temperature values and
current temperature settings of each thermostat. If the settings
reflect a need for a heating or cooling unit to be turned o n, the
process shall issue a request to turn on the appropriate unit.
This determination shall be made in accordance with the rules
outlined in section 3.1.4.1 and 3.1.4.2.

## Outputs

H/C Request

## Validate Temperature (SRS -008)

## Introduction

the product system shall only respond to temperatures from the
thermostats that are within the specified valid range.

## Inputs

Operational Parameters
Temperature Data

## Processing

Two types of temperature data shall be recognized from the
thermostats: 1) the temperature setting and 2) the current
temperature. This module shall process both types of data.
A current temperature value that is received from an individual
thermostat shall be compared to the valid temperature range
values. If the current temperature value is strictly less than
the lower value of the valid temperature range or if the received
temperature value is strictly greater than the upper value of the
valid temperature range, then the product system shall identify
the current temperature value as an invalid temperature and shall
output an invalid temperature status. Otherwise, the product
system shall output a valid temperature status.
A temperature setting value that is received from an individual
thermostat shall be compared to the valid temperature range
values. If the temperature setting value is strictly less than
the lower value of the valid temperature range or if the
temperature setting value is strictly greater than the upper
value of the valid temperature range, then the product system
shall identify the temperature setting as an invalid temperature
and shall output an invalid temperature status. Otherwise, the
the product system shall realize the value for that thermostat’s
temperature setting.

## Outputs

Invalid Temperature
Valid Temperature

## Monitor Temperature

The following sections describe the Monitor Temperature component
of the product system.

## Determine Temperature Status (SRS -009)

## Introduction

the product system shall determine wh en a reported temperature or
a changed temperature setting exceeds the limits set by the
overtemperature values. Temperatures that exceed the
overtemperature limits shall be reported as such. Temperatures
that do not exceed these limits shall be output for subsequent
processing.

## Inputs

Valid Temperatures
Trigger Values
Overtemp Values

## Processing

the product system shall compare the reported temperature value to
the temperature setting and detect when the temperature value
exceeds the specified limits. To clarify these conditions, the
following definitions will be used:
LO : Lower Overtemperature Value = TSET - OD
UO : Upper Overtemperature Value = TSET + OD
If T = LO or UO = T then the product system shall recognize this
condition as the temperature limit has been exceeded. In this
case this process shall output the condition of the temperature
limit having been exceeded.
If LO = T = UO, then this process shall output the
temperature status.

## Outputs

Temperature Trigger Exceeded
Temperature Limit Exceeded

## Determine H/C Mode (SRS -010)

## Introduction

When the current temperature value exceeds the current
temperature setting by a pre -defined amount, the product system
shall activate the appropriate heating or cooling unit.s

## Inputs

Temperature Trigger Exceeded

## Processing

There are two conditions for each individual thermostat that
shall be tested for: 1) the thermostat’s settings are satisfied
and 2) the thermostat’s temperature indica tes it requires a
heating or cooling unit to be turned on. To clarify these
conditions, the following definitions will be used:
LT : Lower Trigger Value = TSET - TD
UT : Upper Trigger Value = TSET + TD
Condition 1: LT = T = UT
This condition indicates the thermostat’s current temperature
setting is satisfied. If this condition is true, then the module
shall output a request to turn off both the heating unit and the
cooling unit.
Condition 2: LO =  LT or UT T = UO
This condition the need for a heating or cooling unit to be
turned on. If this condition is true, then this module shall
output a request to turn on the heating unit if LO = T LT or
the cooling unit if UT T = UO.

## Outputs

H/C Request

## Determine utilizations

## Determine Status of All H/C Units (SRS -011)

## Introduction

the product system shall control each of the heating and cooling
units that are defined for the system. the product system shall
limit the number of heating or cooling units t hat may be running
simultaneously.

## Inputs

Operational Parameters
H/C Request

## Processing

the product system shall maintain the ON/OFF status of each
heating and cooling unit. When a request to turn on or off a
heating or cooling unit, the following processing will occur.
When a request to turn on a heating or cooling unit is received,
the system shall determine if the request can be honored. If the
maximum number of heating or cooling units is already running,
the request will be added to a LIFO queue. If the maximum number
of heating or cooling units is not running, this process will
generate a request to turn on the requested unit.
When a request to turn off a heating or cooling unit is received,
this process shall check the queue of waiting heating and cooling
requests. If the queue is not empty, this process shall remove
one request from the LIFO queue and check the current state of
the thermostat for which the queued request was made. If that
thermostat still needs a heating o r cooling unit turned on, this
process shall submit a request to turn that unit on.

## Outputs

Unit Unavailable
H/C ON/OFF Request

## Generate Unit Unavailable Event (SRS -012)

## Introduction

When a request for a heating unit or cooling to be turned is
denied, an event shall be generated and the product system shall
record that event. The information in these events will be used
for creating statistical reports.

## Inputs
