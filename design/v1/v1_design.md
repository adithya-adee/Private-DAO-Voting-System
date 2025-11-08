# Design Document: Private DAO Voting System

## 1. Overview

This document outlines the technical design for the Private DAO Voting System. The architecture is built on two core technologies: the **Solana blockchain** for maintaining on-chain state and ensuring data availability, and **Arcium** for confidential computation to protect voter privacy.

The primary goal is to create a system where DAO members can vote on proposals without their individual votes being publicly known, while still allowing for the final, aggregated tally to be publicly verifiable.

The design is centered around two main on-chain data structures:
1.  A **`Proposal` account**, which acts as the central hub for all information related to a single vote.
2.  A **`VoteReceipt` account**, which is a lightweight proof that a specific user has already participated in a vote, thus preventing double-voting.

This model is scalable, secure, and aligns with common Solana development patterns.

---

## 2. On-Chain Program Design (Solana)

The on-chain program is responsible for managing the state of proposals and validating voter actions.

### 2.1. Accounts

In this design, each account's on-chain address serves as its unique identifier, similar to a primary key in a traditional database. These addresses are Program-Derived Addresses (PDAs), and the seeds used for their derivation act as the composite primary key, ensuring that each account is uniquely and deterministically addressable.


#### 2.1.1. `Proposal` Account (PDA)

This account stores all public data and the final results for a single governance proposal. It is a Program-Derived Account (PDA).

*   **Purpose:** Acts as the source of truth for a proposal's lifecycle.
*   **Primary Key:** The account's address, derived from the seeds below.
*   **PDA Seeds:** `[b"proposal", creator_pubkey.as_ref(), proposal_id.to_le_bytes().as_ref()]`
    *   `creator_pubkey`: The public key of the DAO administrator who created the proposal.
    *   `proposal_id`: A unique identifier (e.g., a counter) managed by the creator to allow them to create multiple proposals.
*   **Data Structure:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `creator` | `Pubkey` | The administrator who created the proposal. |
| `proposal_id` | `u64` | The unique ID of this proposal for the creator. |
| `description` | `String` | The text of the proposal to be voted on. |
| `voting_start_timestamp` | `i64` | Unix timestamp for when voting begins. |
| `voting_end_timestamp` | `i64` | Unix timestamp for when voting ends. |
| `yes_votes` | `u64` | The final count of "Yes" votes. Populated by `finalize_vote`. |
| `no_votes` | `u64` | The final count of "No" votes. Populated by `finalize_vote`. |
| `total_votes_cast`| `u64` | A real-time counter of how many votes have been submitted. |
| `is_finalized` | `bool` | A flag to indicate if the vote has been tallied and closed. |

#### 2.1.2. `VoteReceipt` Account (PDA)

This account serves as an on-chain, tamper-proof receipt to confirm that a user has voted on a specific proposal.

*   **Purpose:** To prevent users from voting more than once on the same proposal.
*   **Primary Key:** The account's address, derived from the seeds below. Its existence guarantees that a voter has participated in a specific proposal's vote exactly once.
*   **PDA Seeds:** `[b"vote_receipt", voter_pubkey.as_ref(), proposal_pubkey.as_ref()]`
    *   `voter_pubkey`: The public key of the voter.
    *   `proposal_pubkey`: The public key of the `Proposal` account they are voting on.
*   **Data Structure:** The account's data field is empty. Its existence on the blockchain is sufficient proof that the user has voted. This is a gas-efficient method for tracking participation.

### 2.2. Instructions

#### 2.2.1. `create_proposal`

*   **Purpose:** Allows a DAO administrator to create a new proposal for voting.
*   **Accounts Required:**
    *   `proposal`: The `Proposal` account to be created (writable).
    *   `creator`: The DAO administrator creating the proposal (signer).
    *   `system_program`: Required by Solana to create a new account.
*   **Logic:**
    1.  Initializes the `Proposal` account with the provided `description`, `voting_start_timestamp`, and `voting_end_timestamp`.
    2.  Sets `yes_votes`, `no_votes`, and `total_votes_cast` to `0`.
    3.  Sets `is_finalized` to `false`.

#### 2.2.2. `cast_vote`

*   **Purpose:** Allows an eligible DAO member to cast their private, encrypted vote.
*   **Arguments:** `encrypted_vote: Vec<u8>`
*   **Accounts Required:**
    *   `proposal`: The `Proposal` account being voted on (writable, to increment counter).
    *   `vote_receipt`: The `VoteReceipt` account to be created (writable).
    *   `voter`: The user casting the vote (signer).
    *   `system_program`: Required to create the `VoteReceipt` account.
*   **Logic:**
    1.  Asserts that the `proposal.is_finalized` flag is `false`.
    2.  Asserts that the current time is before `proposal.voting_end_timestamp`.
    3.  Verifies the voter's eligibility (e.g., by requiring them to hold a specific governance token).
    4.  Creates the `VoteReceipt` account. This transaction will fail if the account already exists, which elegantly prevents double voting.
    5.  Increments the `total_votes_cast` counter on the `Proposal` account.
    6.  **Emits an event/log** containing the `proposal`'s public key and the `encrypted_vote`. This is the critical step for off-chain processing.

#### 2.2.3. `finalize_vote`

*   **Purpose:** To write the final, aggregated vote tally from Arcium back to the on-chain `Proposal` account.
*   **Arguments:** `yes_votes: u64`, `no_votes: u64`, `proof: Vec<u8>`
*   **Accounts Required:**
    *   `proposal`: The `Proposal` account to be updated (writable).
    *   `finalizer`: The user authorized to finalize the vote (signer).
*   **Logic:**
    1.  Asserts that the current time is after `proposal.voting_end_timestamp`.
    2.  Asserts that `proposal.is_finalized` is `false`.
    3.  Verifies the cryptographic `proof` provided by Arcium to ensure the results are legitimate and not fabricated.
    4.  Updates the `yes_votes` and `no_votes` fields on the `Proposal` account.
    5.  Sets `is_finalized` to `true` to close the vote permanently.

---

## 3. Confidential Computation Layer (Arcium)

Arcium handles the privacy-preserving tally of the encrypted votes.

*   **Off-Chain Listener:** A service (e.g., a Node.js script using Helius or `@solana/web3.js`) continuously monitors the Solana blockchain for the event logs emitted by the `cast_vote` instruction. When an event is detected, it securely forwards the `encrypted_vote` and its associated `proposal` key to the Arcium environment.

*   **Arcium MXE (Multiparty computation eXecution Environment):** This is the confidential environment where the votes are tallied.
    1.  It receives the stream of encrypted votes from the listener.
    2.  It performs a computation (e.g., homomorphic encryption or secure multiparty computation) to sum the "Yes" and "No" votes **without ever decrypting them**.
    3.  After the voting period, it produces the final aggregated tally and a cryptographic proof that the tally is correct. This result and proof are then used to call the `finalize_vote` instruction.

---

## 4. End-to-End Interaction Flow

1.  **Proposal Creation:** A DAO Admin calls `create_proposal`. A new `Proposal` account is created on-chain.
2.  **Voting:**
    *   A DAO Member's client-side application encrypts their vote ("Yes" or "No") using the Arcium SDK.
    *   The member calls `cast_vote` with the encrypted vote.
    *   The on-chain program validates the action, creates a `VoteReceipt` account, increments the public vote counter, and emits the encrypted vote in an event.
3.  **Confidential Tallying:**
    *   The off-chain listener picks up the event and sends the encrypted vote to Arcium.
    *   This repeats for every voter.
4.  **Finalization:**
    *   After the `voting_end_timestamp` passes, Arcium computes the final tally and generates a proof.
    *   An authorized user calls `finalize_vote` with the tally and proof from Arcium.
    *   The on-chain program verifies the proof and writes the final `yes_votes` and `no_votes` to the `Proposal` account.
5.  **Result Display:** The UI reads the now-public results from the `Proposal` account and displays them to all users.

### Data Flow Diagram

```
               +----------------+      +--------------------+      +-------------------+
(1. create)    |                |      |                    |      |                   |
(2. vote)----->|  DAO Member /  |----->|   Solana Program   |----->| Off-Chain Listener|
(5. results)   |      UI        |      | (On-Chain State)   |      |  (Helius / etc.)  |
<--------------|                |<---- |                    |<---- |                   |
               +----------------+      +--------------------+      +----------+--------+
                                             ^      | (3. Encrypted Vote Event)       |
                                             |      |                                 v
                               (4. Final Tally + Proof) |                      +--------+----------+
                                             |      |                      |                   |
                                             |      +--------------------->|    Arcium MXE     |
                                             |                             |  (Confidential    |
                                             +-----------------------------|      Tally)       |
                                                                           |                   |
                                                                           +-------------------+
```