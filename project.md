# Project Requirements Document: Private DAO Voting System

## 1. Overview

This document outlines the requirements for a **Private Decentralized Autonomous Organization (DAO) Voting System**.

The project aims to build a decentralized application (dApp) that allows members of a DAO to vote on proposals without revealing their individual votes to the public. This ensures voter privacy, prevents coercion, and promotes fair governance.

The system will be built on the Solana blockchain for its high speed and low transaction costs, and it will leverage a confidential computing layer like Arcium to ensure that votes are tallied privately. Real-time on-chain event updates will be handled by Helius's LaserStream gRPC service to create a responsive and modern user experience.

## 2. Project Goals

*   **Develop a Functional Private Voting System:** The primary goal is to create a working dApp that facilitates private voting for DAOs.
*   **Ensure Voter Anonymity:** Individual votes must remain encrypted and private, with only the final aggregated results being made public.
*   **Guarantee Verifiability:** While votes are private, the system must provide a way to publicly verify the correctness of the final vote tally.
*   **Build a Real-Time User Experience:** The application's front-end should reflect on-chain events, such as new proposals and votes, in real-time without requiring manual refreshes.
*   **Explore Hybrid Blockchain Architecture:** Gain hands-on experience integrating a public ledger (Solana) with a confidential off-chain computation environment (Arcium).

## 3. User Roles & Personas

*   **DAO Member (Voter):** A user who holds the DAO's governance token. They can view proposals and cast private votes.
*   **DAO Administrator (Proposer):** A user with the authority to create new governance proposals to be voted on by members.
*   **Public Observer:** Any individual who can view public information, such as proposal descriptions and final, aggregated vote results, but cannot participate in voting or view individual votes.

## 4. System Architecture & Features

The system is composed of three main layers: the Solana blockchain for on-chain state, Arcium for confidential computation, and a client-side application for user interaction.

### 4.1. On-Chain Components (Solana)

*   **Governance Token:** A standard SPL Token that represents membership and voting power within the DAO.
*   **Proposal Accounts (PDAs):** Solana Program-Derived Accounts (PDAs) will be used to store public data for each proposal, including:
    *   Proposal description and details.
    *   Voting start and end times.
    *   Final, aggregated vote counts (e.g., total "Yes" and "No" votes).
*   **Voter Eligibility Program:** A Solana program that checks if a user holds the required governance token to be eligible to vote.
*   **Voting Instructions:**
    *   `create_proposal`: Allows a DAO administrator to create a new proposal account.
    *   `cast_vote`: Allows an eligible DAO member to submit their encrypted vote.
    *   `finalize_vote`: An instruction to write the final aggregated results from Arcium back to the on-chain proposal account.

### 4.2. Confidential Components (Arcium)

*   **Encrypted Voting:** User votes ("Yes" or "No") are encrypted on the client-side before being submitted to the system.
*   **Confidential Vote Tallying:** Encrypted votes are processed by an Arcium **Multiparty computation eXecution Environment (MXE)**. The MXE will:
    *   Securely receive encrypted votes from multiple users.
    *   Tally the votes *without ever decrypting them*, preserving privacy.
    *   Generate a cryptographic proof (e.g., a Zero-Knowledge Proof) to certify that the tally is accurate.
*   **State Consensus:** The final, aggregated vote count (but not the individual votes) is securely sent back to the Solana program to be stored on-chain.

### 4.3. Real-Time Data Layer (Helius LaserStream)

*   **Real-Time Proposal Feed:** The UI will display new proposals instantly.
    *   *Implementation:* A backend service will use LaserStream to listen for `create_proposal` transactions. When a new proposal is detected, the service will push the update to all connected clients via WebSockets.
*   **Live Vote Activity:** The UI will show a real-time counter of how many encrypted votes have been cast, providing users with immediate feedback.
    *   *Implementation:* The LaserStream service will monitor `cast_vote` transactions and instruct the backend to increment a vote counter.
*   **Instant Result Announcements:** The final results will be displayed across the dApp and other channels (e.g., Discord) the moment they are available on-chain.
    *   *Implementation:* LaserStream will listen for the `finalize_vote` transaction and trigger the backend to broadcast the final results.

## 5. Technical Stack

*   **Blockchain:** Solana
*   **Confidential Computing:** Arcium
*   **Real-Time Data Streaming:** Helius LaserStream gRPC
*   **On-Chain Programs:** Rust, Anchor Framework
*   **Tokens:** SPL (Solana Program Library)
*   **Off-Chain Services:** Node.js/TypeScript (for backend logic and LaserStream client)
*   **Front-End:** React/Next.js or a similar modern web framework

## 6. Out of Scope

*   **User/Wallet Management:** The project will assume users already have a compatible Solana wallet (e.g., Phantom) and will not build a new wallet solution.
*   **Advanced Governance Models:** This project will focus on simple "Yes/No" proposals. More complex voting mechanisms (e.g., ranked-choice, quadratic voting) are not in the initial scope.
*   **Front-End UI Design:** While a functional UI is required, creating a highly polished, production-ready design is a secondary goal.

## 7. Success Metrics

*   All individual votes are successfully encrypted and remain private throughout the process.
*   The final vote tally is accurately computed and publicly verifiable on the Solana blockchain.
*   The application UI updates in near real-time (<2 seconds) in response to on-chain events.
*   The system can successfully handle at least 100 concurrent votes.
