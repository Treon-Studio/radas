# Muslimfy Browser Extension
## Product Requirements Document (PRD)

**Version:** 1.0.0  
**Date:** June 2023  
**Author:** Treon Studio  

## Table of Contents
1. [Introduction](#introduction)
2. [Product Overview](#product-overview)
3. [User Personas](#user-personas)
4. [Features and Requirements](#features-and-requirements)
   - [Prayer Times](#prayer-times)
   - [Quran Reader](#quran-reader)
   - [Tasbih Counter](#tasbih-counter)
   - [Verse of the Day](#verse-of-the-day)
   - [Audio Player](#audio-player)
   - [Dynamic UI](#dynamic-ui)
5. [User Flows](#user-flows)
6. [Non-Functional Requirements](#non-functional-requirements)
7. [Technical Requirements](#technical-requirements)
8. [Future Enhancements](#future-enhancements)

## Introduction

Muslimfy is a browser extension designed to assist Muslims with their daily religious activities. It provides a comprehensive set of tools that helps users read the Quran, get accurate prayer times, count tasbih (Islamic prayer beads), and listen to Murattal recitations - all conveniently accessible from their browser.

This document outlines the requirements and specifications for the Muslimfy browser extension, based on the existing codebase and functionality.

## Product Overview

Muslimfy integrates seamlessly into the user's browser, providing a suite of Islamic tools accessible from a single extension. Its main components include:

- **Prayer Times:** Accurate prayer time calculations with location awareness
- **Quran Reader:** Full Quran with translation and transliteration
- **Tasbih Counter:** Digital dhikr counter with common phrases
- **Verse of the Day:** Daily inspirational Quran verse
- **Audio Player:** Listen to Murattal (Quran recitations)
- **Dynamic UI:** Adapts to day/night modes and responsive across devices

The extension is designed with both practicality and aesthetics in mind, featuring a modern, clean interface with meaningful animations and visual indicators.

## User Personas

1. **Regular Practitioner**
   - Muslim who prays five times daily
   - Reads Quran regularly
   - Wants convenient access to Islamic tools during work/study
   - Values accuracy and reliability in prayer times

2. **Occasional User**
   - Muslim who practices intermittently
   - Uses Islamic apps mainly for special occasions
   - Appreciates reminders and ease of use
   - Values inspirational content (Verse of the Day)

3. **Quran Student**
   - Studying the Quran regularly
   - Requires accurate translations and transliterations
   - Uses bookmarking features frequently
   - May listen to recitations for memorization

## Features and Requirements

### Prayer Times

**Description:** Provides accurate prayer times based on user location with customizable notification settings.

**Key Requirements:**
- Display the five daily prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha)
- Auto-detect user location with permission
- Support manual location selection
- Allow selection of calculation methods (multiple recognized methods)
- Highlight the current/next prayer time
- Show countdown to next prayer
- Display prayer time notifications
- Support for Indonesian cities database
- Allow adjustment of notification settings
- Show prayer time status (on time, missed, upcoming)
- Responsive layout for different screen sizes

### Quran Reader

**Description:** A complete Quran reader with translation, transliteration, and bookmarking capabilities.

**Key Requirements:**
- Complete Quran text in Arabic
- English translations of all verses
- Optional transliteration
- Navigation by surah (chapter) and ayah (verse)
- Search functionality
- Bookmarking system
- Adjustable font size
- Copy and share verses
- Reading mode with minimized distractions
- Offline access to previously loaded content
- Status indicator (online/offline/local data)
- Responsive design for different screen sizes

### Tasbih Counter

**Description:** Digital counter for dhikr (Islamic devotional acts) with preset phrases and customizable count targets.

**Key Requirements:**
- Counter with increment and reset functions
- Pre-configured common dhikr phrases:
  - SubhanAllah (Glory be to Allah)
  - Alhamdulillah (All praise is due to Allah)
  - Allahu Akbar (Allah is the Greatest)
  - La hawla wa la quwwata illa billah (There is no power except with Allah)
  - Astaghfirullah (I seek forgiveness from Allah)
  - Allahumma salli ala Muhammad (O Allah, send blessings upon Muhammad)
- Display Arabic text, transliteration, and meaning
- Visual progress indicator
- Completion counter for full cycles
- Optional haptic feedback on mobile devices
- Beautiful, distraction-free design
- Color-coding for different dhikr types

### Verse of the Day

**Description:** Displays a randomly selected Quran verse daily for inspiration.

**Key Requirements:**
- Show a new verse each day
- Display Arabic text with translation
- Optional transliteration
- Show surah and ayah reference
- Refresh option for new verse
- Bookmarking capability
- Share functionality
- Open in full Quran reader option
- Offline support for previously loaded verses
- Status indicator (online/offline/local)
- Simple, focused interface

### Audio Player

**Description:** Built-in player for Murattal (Quran recitations) by renowned Qaris (reciters).

**Key Requirements:**
- Collection of pre-selected Quran recitations
- Display track information (surah, reciter)
- Standard playback controls (play/pause, previous, next)
- Seekable progress bar
- Volume control with mute option
- Auto-play next track option
- Playlist view with selection capability
- Background playback while using other features
- Responsive design for different screen sizes

### Dynamic UI

**Description:** User interface that adapts to day/night modes and device types.

**Key Requirements:**
- Automatic day/night detection
- Different backgrounds and color schemes based on time of day
- Responsive layout for mobile, tablet, and desktop
- Elegant animations and transitions
- Consistent design language across components
- Modern glassmorphism UI style
- High-contrast mode for accessibility
- Support for different browser environments

## User Flows

### Primary User Flow
1. User clicks the Muslimfy extension icon in browser
2. Islamic Companion dashboard loads showing:
   - Current prayer times with next prayer highlighted
   - Verse of the Day
   - Quick access to Tasbih, Quran Reader, and Audio Player
3. User interacts with desired component
4. Settings and preferences persist between sessions

### Prayer Times Flow
1. Prayer Times component displays current day's prayer schedule
2. User can toggle location settings (auto/manual)
3. If manual, user selects location from database or enters coordinates
4. User can adjust notification preferences
5. System sends notifications at configured times

### Quran Reading Flow
1. User opens Quran Reader from dashboard
2. Default view shows surah list
3. User selects a surah to read
4. Reader displays Arabic text, translation, and optional transliteration
5. User can navigate between verses, bookmark, copy, or share content
6. User can adjust display settings (font size, translation toggle)

### Tasbih Counter Flow
1. User selects Tasbih Counter from dashboard
2. Default dhikr phrase is displayed
3. User taps/clicks to increment counter
4. Progress indicator shows completion percentage
5. Counter tracks completed cycles
6. User can reset count or select different dhikr phrase

### Audio Playback Flow
1. User opens Audio Player from dashboard
2. Default track loads (or previously playing track)
3. User controls playback (play/pause, next/previous)
4. User can open playlist to select different track
5. Audio continues playing while using other features

## Non-Functional Requirements

### Performance
- Fast initial load time (<3 seconds)
- Smooth interactions without noticeable lag
- Efficient memory usage appropriate for browser extension

### Reliability
- Offline functionality for critical features
- Graceful error handling
- Data persistence between sessions

### Usability
- Intuitive interface requiring minimal instruction
- Consistent design patterns across features
- Responsive design for all screen sizes
- Clear visual feedback for all actions

### Compatibility
- Support for major browsers (Chrome, Edge, Firefox)
- Compatible with desktop and mobile browsers where extension support exists

## Technical Requirements

### Architecture
- React-based browser extension
- TypeScript for type safety
- WXT build system
- State management for user preferences and application state
- Service workers for offline functionality
- LocalStorage for persistent data

### Dependencies
- React with TypeScript
- WXT for extension development
- Tailwind CSS for styling
- Lucide React for icons
- Other UI components as needed (shadcn/ui)
- Prayer times calculation library
- Audio playback library (ReactPlayer)

### Data Requirements
- Quran text, translation, and audio data
- Prayer times calculation algorithms
- Indonesian cities database
- User preferences storage

## Future Enhancements

Potential features for future versions:

- **Community Features:** Share verses or experiences with other users
- **Advanced Quran Study:** Tafsir (exegesis) integration
- **Islamic Calendar:** Hijri date converter and important dates
- **Multiple Languages:** Support for additional translations
- **Custom Dhikr:** Allow users to add custom phrases to the tasbih counter
- **More Reciters:** Expanded audio library with more Qaris
- **Qibla Direction:** Find the direction of Mecca
- **Dua Collection:** Searchable database of Islamic supplications
- **Ramadan Features:** Special tools for the fasting month
- **Islamic Articles:** Daily or weekly Islamic knowledge articles
