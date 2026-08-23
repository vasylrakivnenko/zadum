## the product, Version 1.0

1.0

## Introduction

## Purpose

This specifications establishes the requirements for the product named
the product. The intended audience is the analyst, programmer and tester of
the product.

## Scope

The product is a computerized game that displays an interface used to solve a
specific headache.

## Definitions, Acronyms, and Abbreviations

Not applicable.

## References

Not applicable.

## SRS Document Overview

The remaining sections of this document provide a general description, including
characteristics of the users of this project, the product' hsardware, and the
functional and data requirements of the product. General description of the
project is discussed in section 2 of this document. Section 2 gives the functional
requirements, data requirements and constraints and assumptions made while
designing the game. It also gives the user viewpoint of product use. Section 3
gives the specific requirements of the product. Section 3.0 also discusses the
external interface requirements and gives detailed description of functional
requirements.

## GENERAL DESCRIPTION

## Product Perspective

## User Interfaces

The product runs as a standalone application.
Its user interface uses menus, graphics and sounds.

## Hardware Interfaces

The product requires the use of a keyboard and a mouse to interface with the
user. It requires a graphical display of at least 800*600 resolution.

## Software Interfaces

The product uses the Qt graphical library. It must run with all the operating
systems that Qt supports.

## Communications Interfaces

Not applicable.

## Memory Constraints

Not applicable.

## Site Adaptation Requirements

Not applicable.

## Product Functions

## Undo et Redo Actions.

The user must undo and redo its last thousand actions.

## Time passed to play.

The product must count and display the time that the user uses to play.

## Count of action number.

The product must count and display the number of the user' asction.

## Score.

The product must record the score (time and number of counts) of a play
associated with the name of a user.

## Score window.

The product must display a window with all the player' scores.

## User Characteristics

No qualification is necessary.

## Start Up Requirements

Not applicable.

## Apportioning of Requirements

Not applicable.

## SPECIFIC REQUIREMENTS

## External Interfaces

The product generally requires a mouse and a keyboard for input. Other pointing
and input devices are allowable, provided they provide similar functions to a
mouse and keyboard, namely the ability to move a cursor onscreen to select
buttons and the ability to type names.
The product uses menus, graphics and sounds. The hardware and operating
system must provide an 800x600 screen resolution. Sound is not required to play
the game.

## User Interfaces

## Introduction

The users consist of anyone who wants to play a simple game who knows how to
operate a computer, with a beginning level player starting at age 8, up through an
advanced level player who could be an adult.

## Main window

The main window shall provide the following parts :

A board, see chapter 3.2.1.1.
a menu bar, see chapter 3.2.5

## Software Interfaces

Not applicable.

## Communications Interfaces

Not applicable.

## Functional Requirements

## Actions.

## Presentation of the board.

The board is a rectangular zone where the user could move some blocks. Let x be
the mesure unit. The height of the board game is 5x, its width is 4x : x can't be
less than 50 pixels and greater than 100 pixels. The blocks are separated by a
marge of 0.1x.
There are four square blocks with a side of x.
There are four rectangular blocks with the following dimensions : a height of 2x
and a width of x.
There is one block with the following dimensions : a height of x and a width of 2x.
There is one square block with a side of 2x.
The board is black and the blocks are yellow.

## Block selection

## Description

See above chapter 3.2.1.1.

## Input

Leftclicked
down on a block.

## Processing

The game state becomes "Block deplacement".

## Output

None.

## Block deselection

## Description

See above chapter 3.2.1.1.

## Input

Leftclicked
up on a selected block.

## Processing

The game state becomes "Block selection".

## Output

None.

## Block movement

## Description

See above chapter 3.2.1.1.

## Input

Mouse movement during the "Block movement" state.

## Processing

The selected block follows the mouse movement without overlapp the other
blocks and exit of the game zone. The selected block can' mt ove near other blocks
at least 0.05x from the others blocks.

## Output

None.

## Undo Action

## Descritption

The user can cancel a movement.

## Input

Menu selection.

## Processing

The game displays the block positions at the places where they were before the
last movement. This action is consider like a movement. The "undo" action is
unvailable if there was no previous movement.

## Output

New game board display.

## Redo Action

## Descritption

The user can redo a movement that has been canceled.

## Input

Menu selection.

## Processing

The game displays the block positions at the places where they were before the
last movement was canceled. This action is consider like a movement. The redo
action is unvailable, if the previous action wasn't a n "undo" action.

## Output

New game board display.

## End of the game management

## End of the game

## Description

How the user finishs the game.

## Input

The great square is moved at the bottom of the board.

## Processing

All the player statistics are freezed.

## Outputs

If the number of block movements of the current player is lower than the highest
number of block movement recorded in the statistic file, the The "Finish Window
with Statistcs" is displayed, see chapter 3.2.2.2. If not the "Simple finish Window"
is displayed, see chapter 3.2.2.3.

## Finish Window with Statistics.

## Description

The Finish Window with Statisctis contains a the following text : "You win ! Enter
your name : ", an Edit Box that can contain 20 characters and a pushbutton with
the label "OK".

## Input

The games is over, see chapter 3.2.2.1.

## Processing

The player clicks on the pushbutton "OK". The player statistics are recorded in the
statistic file of the software, according to the requirement of the chapter 3.2.3.2.

## Outputs

The "finish" window is closed. The statistic window is displayed, see chapter
3.2.3.4.

## Simple Finish Window

## Description

The Simple Finish Window contains a the following text : "You win !" and a
pushbutton with the label "OK".

## Input

The games is over, see chapter 3.2.2.1.

## Processing

The player clicks on the pushbutton "OK".

## Outputs

The Simple Finish Window is closed. The statistic window is displayed, see
chapter 3.2.3.4.

## Statistics Management.

## Player Statistics management

## Desciption

The following statistics are recorded during the game :

number of block movements since the start.
time since the start.

## Input

A block movement.

## Processing

The number of block movement in incremented of 1. The difference of time of the
block movement and the previous recorded time is recorded.

## Output

None.

## Game Statistics management

## Desciption

The game statistics is composed of 10 player statistics.

## Input

The Finish Window with Statistics is completed by the player, see chapter 3.2.2.2.

## Processing

The statistics of the player (its name, the block movement number, the time
passed to solve the headache) is recorded in the statistic file. If 10 player statistics
are already recorded, the player statistics of the file with the greatest number of
block movements is erased.

## Output

If the file was correctly updated, there is no ouput. If not, like wrong pemissions
or disk full, an error message is displayed.

## Statistics erasing

## Descritption

The user could erase all the statistics.

## Input

Menu selection.

## Processing

The data stored in the statistic file are erased.

## Output

If the file was correctly updated, there is no ouput. If not, like wrong pemissions
or disk full, an error message is displayed.

## Statistic Window.

## Descritption

The Player Statistics Window is composed of a listbox of 10 lines. Each line is
composed of the name of a player, the number of block movement, the time used
by the player to solve the headache.
This statistcs are read from the statistic file of the game.

## Input

End of the game (see chapter 3.2.2.1) or menu selection.

## Processing

Window display.

## Output

None.

## File management

## Open game

## Description

Open a previous saved game.

## Input

Menu selection.

## Processing

A dialog box is open : the user could choose a file that contains all the data of the
game previously saved.

## Ouput

The board game is redraw
according to the file data. The player statistics are set
to the player statistics of the file data.

## Save game

## Description

Save the current game.

## Input

Menu selection.

## Processing

If the game was never saved, the processing is identiqual to the action "Save as...".
If not, the following internal data are saved into the previous file that was used to
to save the the game : the current positions of the blocks, their last 10000
previous positions, the number of the previous movements and the time passed by
the user to solve the headache.

## Ouput

None.

## Save game as

## Description

Save the current game.

## Input

Menu selection.

## Processing

A dialog box is open : the user could choose a file that will contain all the data of
the current game. Next, the following internal data are saved into the file : the
current positions of the blocks, their previous positions, the number of the
previous movements and the time passed by the user to solve the headache.

## Ouput

None.

## Exit

## Description

Stop the game

## Input

Menu selection.

## Processing

If the game is not saved, a dialog box is displayed that asks to the player if he
wants to save the game. Two choices are possible : "Yes" and "No". If "Yes" is
selected, the action "Save" is processed and the main window disappeared. If "No"
is selected, the main window disappeared.

## Ouput

None.

## Menu bar

## Game menu

## Description

Contains "Open game ...", "Save Game ...", "Save Game As..." and "Exit". In this
order.

## Input

Menu selection.

## Processing

Action in question is performed :

"Open game ..." >
action "Open game", see chapter 3.2.4.1.
"Save Game ..." >
action "Save Game", see chapter 3.2.4.2.
"Save Game As ..." >
action "Save game as", see chapter 3.2.4.3.
"Exit" >
action "Exit", see chapter 3.2.4.4.

## Output

Menu disappears. Requirements of the action determines the continuation.

## Action menu

## Description

Contains "Undo" and "Redo". In this order. The menu selection is unvailable if the
associated action is unvailable.

## Inputs

Menu selection.

## Processing

Action in question is performed :

"Undo" >
action "Undo", see chapter 3.2.1.5.
"Redo" >
action "Redo", see chapter 3.2.1.6.

## Outputs

Menu disappears. Requirements of the action determines the continuation.

## Statisctis menu

## Description

Contains "Display" and "Erase". In this order.

## Inputs

Menu selection.

## Processing

Action in question is performed :

"Display" >
displays the statistic window, see chapter 3.2.3.4.
"Erase" >
erase the statistics, see chapter 3.2.3.3.

## Outputs

Menu disappears. Requirements of the action determines the continuation.

## Help menu

## Description

Contains "About".

## Inputs

Menu selection.

## Processing

"About Window" is displayed. The "About Windows" is composed of the following
text "the product 1.0 by JeanPhilippe
Brossat jp_brossat@yahoo.fr"

## Outputs

Menu disappears. Requirements of the action determines the continuation.

## 3.3Performance Requirements

There can be only one user per machine.

## Software System Attributes

The software must be portable to the Windows OS.