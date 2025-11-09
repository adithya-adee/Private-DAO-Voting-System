use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

declare_id!("5FwBY9zt1cgHBSHwa4vJsrXeJ7raJG9VRkxr39gw8R8i");

#[program]
pub mod voting_system {
    use super::*;

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        proposal_id: u64,
        description: String,
        voting_start_timestamp: i64,
        voting_end_timestamp: i64,
    ) -> Result<()> {
        let proposal_account = &mut ctx.accounts.proposal;

        proposal_account.creator = ctx.accounts.creator.key();
        proposal_account.proposal_id = proposal_id;
        proposal_account.description = description;
        proposal_account.voting_start_timestamp = voting_start_timestamp;
        proposal_account.voting_end_timestamp = voting_end_timestamp;
        proposal_account.yes_votes = 0;
        proposal_account.no_votes = 0;
        proposal_account.total_votes_cast = 0;
        proposal_account.is_finalized = false;

        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, encrypted_vote: Vec<u8>) -> Result<()> {
        let proposal_account = &mut ctx.accounts.proposal_account;

        require!(!proposal_account.is_finalized, VotingSystemError::Finalized);

        // Get the current clock data
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        require!(
            current_timestamp >= proposal_account.voting_start_timestamp,
            VotingSystemError::VotingNotStarted
        );

        require!(
            current_timestamp < proposal_account.voting_end_timestamp,
            VotingSystemError::TimeExceeded
        );

        //TODO : Implement yes_vote , no_vote increment based on encrypted vote

        // Increment the total votes cast counter
        proposal_account.total_votes_cast = proposal_account
            .total_votes_cast
            .checked_add(1)
            .ok_or(VotingSystemError::Overflow)?;

        // Emit event with encrypted vote for off-chain processing
        emit!(VoteCastEvent {
            proposal: proposal_account.key(),
            voter: ctx.accounts.payer.key(),
            encrypted_vote,
            timestamp: current_timestamp,
        });

        Ok(())
    }

    pub fn finalize_vote(
        ctx: Context<FinalizeVote>,
        yes_votes: u64,
        no_votes: u64,
        proof: Vec<u8>,
    ) -> Result<()> {
        let proposal_account = &mut ctx.accounts.proposal_account;

        // Get time in unix timestamp
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        // check for voting timestamp
        require!(
            current_timestamp > proposal_account.voting_end_timestamp,
            VotingSystemError::WaitTillEndTime
        );

        require!(!proposal_account.is_finalized, VotingSystemError::Finalized);

        // Verify Proof (not yet implemented - arcium integration pending)
        // TODO: Implement cryptographic proof verification
        require!(!proof.is_empty(), VotingSystemError::InvalidProof);

        proposal_account.yes_votes = yes_votes;
        proposal_account.no_votes = no_votes;

        proposal_account.is_finalized = true;

        emit!(VoteFinalizedEvent {
            proposal: proposal_account.key(),
            yes_votes,
            no_votes,
            total_votes_cast: proposal_account.total_votes_cast,
            finalizer: ctx.accounts.finalizer.key(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        seeds = [b"proposal", creator.key().as_ref(), &proposal_id.to_le_bytes()],
        bump,
        payer = creator,
        space = ProposalAccount::INIT_SPACE
    )]
    pub proposal: Box<Account<'info, ProposalAccount>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal_account: Box<Account<'info, ProposalAccount>>,

    /// The voter's governance token account. Must:
    /// - Be a valid SPL Token account
    /// - Hold tokens (non-zero balance)
    /// - Belong to the payer/signer
    #[account(
        constraint = voter.owner == payer.key() @ VotingSystemError::Unauthorized,
        constraint = voter.amount > 0 @ VotingSystemError::Unauthorized,
    )]
    pub voter: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        seeds = [b"vote_receipt", voter.key().as_ref(), proposal_account.key().as_ref()],
        bump,
        payer = payer,
        space = VoteReceipt::INIT_SPACE
    )]
    pub vote_receipt_account: Box<Account<'info, VoteReceipt>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeVote<'info> {
    /// Only the proposal creator can finalize the vote
    #[account(
        constraint = proposal_account.creator == finalizer.key() @ VotingSystemError::Unauthorized
    )]
    pub finalizer: Signer<'info>,

    #[account(mut)]
    pub proposal_account: Box<Account<'info, ProposalAccount>>,
}

#[account]
pub struct ProposalAccount {
    pub creator: Pubkey,
    pub proposal_id: u64,
    pub description: String,
    pub voting_start_timestamp: i64,
    pub voting_end_timestamp: i64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub total_votes_cast: u64,
    pub is_finalized: bool,
}

impl ProposalAccount {
    pub const INIT_SPACE: usize = 8  // discriminator
        + 32 // creator: Pubkey
        + 8  // proposal_id: u64
        + 4  // string prefix
        + 300 // max string bytes for description
        + 8  // voting_start_timestamp: i64
        + 8  // voting_end_timestamp: i64
        + 8  // yes_votes: u64
        + 8  // no_votes: u64
        + 8  // total_votes_cast: u64
        + 1; // is_finalized: bool
}

#[account]
pub struct VoteReceipt {}

impl VoteReceipt {
    pub const INIT_SPACE: usize = 8; // discriminator only
}

#[event]
pub struct VoteCastEvent {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub encrypted_vote: Vec<u8>,
    pub timestamp: i64,
}

#[event]
pub struct VoteFinalizedEvent {
    pub proposal: Pubkey,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub total_votes_cast: u64,
    pub finalizer: Pubkey,
}

#[error_code]
pub enum VotingSystemError {
    #[msg("Voting has already been finalized")]
    Finalized,
    #[msg("Voting period has ended")]
    TimeExceeded,
    #[msg("Voter is not authorized (must hold governance tokens)")]
    Unauthorized,
    #[msg("Voting has not started yet")]
    VotingNotStarted,
    #[msg("Wait until voting period ends")]
    WaitTillEndTime,
    #[msg("Invalid or missing cryptographic proof")]
    InvalidProof,
    #[msg("Arithmetic overflow")]
    Overflow,
}
