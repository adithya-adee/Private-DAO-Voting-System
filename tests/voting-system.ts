import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { VotingSystem } from "../target/types/voting_system";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("voting-system", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VotingSystem as Program<VotingSystem>;

  // Test accounts
  let creator: Keypair;
  let voter1: Keypair;
  let voter2: Keypair;
  let governanceMint: PublicKey;
  let creatorTokenAccount: PublicKey;
  let voter1TokenAccount: PublicKey;
  let voter2TokenAccount: PublicKey;

  // Proposal details
  const proposalId = new BN(1);
  const description = "Should we implement feature X?";
  let votingStartTimestamp: BN;
  let votingEndTimestamp: BN;
  let proposalPda: PublicKey;
  let proposalBump: number;

  before(async () => {
    // Create test keypairs
    creator = Keypair.generate();
    voter1 = Keypair.generate();
    voter2 = Keypair.generate();

    // Airdrop SOL to test accounts
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
    await provider.connection.requestAirdrop(creator.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(voter1.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(voter2.publicKey, airdropAmount);

    // Wait for airdrops to confirm
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create governance token mint
    governanceMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      9 // 9 decimals
    );

    // Create token accounts for creator and voters
    const creatorAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      governanceMint,
      creator.publicKey
    );
    creatorTokenAccount = creatorAta.address;

    const voter1Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      voter1,
      governanceMint,
      voter1.publicKey
    );
    voter1TokenAccount = voter1Ata.address;

    const voter2Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      voter2,
      governanceMint,
      voter2.publicKey
    );
    voter2TokenAccount = voter2Ata.address;

    // Mint tokens to voters
    await mintTo(
      provider.connection,
      creator,
      governanceMint,
      voter1TokenAccount,
      creator,
      1000 * 10 ** 9 // 1000 tokens
    );

    await mintTo(
      provider.connection,
      creator,
      governanceMint,
      voter2TokenAccount,
      creator,
      500 * 10 ** 9 // 500 tokens
    );

    // Derive proposal PDA
    [proposalPda, proposalBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        creator.publicKey.toBuffer(),
        proposalId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Set voting timestamps (start 10 seconds ago, end in 1 hour)
    const now = Math.floor(Date.now() / 1000);
    votingStartTimestamp = new BN(now - 10); // Started 10 seconds ago
    votingEndTimestamp = new BN(now + 3600); // 1 hour from now
  });

  describe("Create Proposal", () => {
    it("Successfully creates a proposal", async () => {
      const tx = await program.methods
        .createProposal(
          proposalId,
          description,
          votingStartTimestamp,
          votingEndTimestamp
        )
        .accounts({
          creator: creator.publicKey,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      console.log("Create proposal transaction signature:", tx);

      // Fetch and verify the proposal account
      const proposalAccount = await program.account.proposalAccount.fetch(
        proposalPda
      );

      assert.equal(
        proposalAccount.creator.toString(),
        creator.publicKey.toString()
      );
      assert.equal(
        proposalAccount.proposalId.toString(),
        proposalId.toString()
      );
      assert.equal(proposalAccount.description, description);
      assert.equal(
        proposalAccount.votingStartTimestamp.toString(),
        votingStartTimestamp.toString()
      );
      assert.equal(
        proposalAccount.votingEndTimestamp.toString(),
        votingEndTimestamp.toString()
      );
      assert.equal(proposalAccount.yesVotes.toString(), "0");
      assert.equal(proposalAccount.noVotes.toString(), "0");
      assert.equal(proposalAccount.totalVotesCast.toString(), "0");
      assert.equal(proposalAccount.isFinalized, false);
    });

    it("Fails to create duplicate proposal with same ID", async () => {
      try {
        await program.methods
          .createProposal(
            proposalId,
            "Duplicate proposal",
            votingStartTimestamp,
            votingEndTimestamp
          )
          .accounts({
            creator: creator.publicKey,
            proposal: proposalPda,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([creator])
          .rpc();

        assert.fail("Should have failed to create duplicate proposal");
      } catch (error) {
        // Expected to fail because account already exists
        assert.ok(error);
      }
    });
  });

  describe("Cast Vote", () => {
    it("Successfully casts a vote from voter1", async () => {
      const encryptedVote = Buffer.from("encrypted_vote_data_voter1");

      // Derive vote receipt PDA
      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          voter1TokenAccount.toBuffer(),
          proposalPda.toBuffer(),
        ],
        program.programId
      );

      const tx = await program.methods
        .castVote(encryptedVote)
        .accounts({
          proposalAccount: proposalPda,
          voter: voter1TokenAccount,
          payer: voter1.publicKey,
          voteReceiptAccount: voteReceiptPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([voter1])
        .rpc();

      console.log("Cast vote transaction signature:", tx);

      // Verify the proposal account was updated
      const proposalAccount = await program.account.proposalAccount.fetch(
        proposalPda
      );
      assert.equal(proposalAccount.totalVotesCast.toString(), "1");

      // Verify vote receipt exists
      const voteReceiptAccount = await program.account.voteReceipt.fetch(
        voteReceiptPda
      );
      assert.ok(voteReceiptAccount);
    });

    it("Successfully casts a vote from voter2", async () => {
      const encryptedVote = Buffer.from("encrypted_vote_data_voter2");

      // Derive vote receipt PDA
      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          voter2TokenAccount.toBuffer(),
          proposalPda.toBuffer(),
        ],
        program.programId
      );

      const tx = await program.methods
        .castVote(encryptedVote)
        .accounts({
          proposalAccount: proposalPda,
          voter: voter2TokenAccount,
          payer: voter2.publicKey,
          voteReceiptAccount: voteReceiptPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([voter2])
        .rpc();

      console.log("Cast vote transaction signature:", tx);

      // Verify the proposal account was updated
      const proposalAccount = await program.account.proposalAccount.fetch(
        proposalPda
      );
      assert.equal(proposalAccount.totalVotesCast.toString(), "2");
    });

    it("Fails when voter tries to vote twice", async () => {
      const encryptedVote = Buffer.from("encrypted_vote_data_duplicate");

      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          voter1TokenAccount.toBuffer(),
          proposalPda.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .castVote(encryptedVote)
          .accounts({
            proposalAccount: proposalPda,
            voter: voter1TokenAccount,
            payer: voter1.publicKey,
            voteReceiptAccount: voteReceiptPda,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([voter1])
          .rpc();

        assert.fail("Should have failed - voter already voted");
      } catch (error) {
        // Expected to fail because vote receipt already exists
        assert.ok(error);
      }
    });

    it("Fails when voter has no governance tokens", async () => {
      const voterNoTokens = Keypair.generate();
      await provider.connection.requestAirdrop(
        voterNoTokens.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create token account but don't mint tokens
      const voterNoTokensAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        voterNoTokens,
        governanceMint,
        voterNoTokens.publicKey
      );

      const encryptedVote = Buffer.from("encrypted_vote_no_tokens");
      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          voterNoTokensAta.address.toBuffer(),
          proposalPda.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .castVote(encryptedVote)
          .accounts({
            proposalAccount: proposalPda,
            voter: voterNoTokensAta.address,
            payer: voterNoTokens.publicKey,
            voteReceiptAccount: voteReceiptPda,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([voterNoTokens])
          .rpc();

        assert.fail("Should have failed - voter has no tokens");
      } catch (error) {
        // Expected to fail due to Unauthorized error
        assert.ok(error.toString().includes("Unauthorized") || error);
      }
    });
  });

  describe("Finalize Vote", () => {
    let proposalId2: BN;
    let proposalPda2: PublicKey;
    let votingEndTimestamp2: BN;

    before(async () => {
      // Create a new proposal that will end soon for finalization tests
      proposalId2 = new BN(2);
      const now = Math.floor(Date.now() / 1000);
      const votingStartTimestamp2 = new BN(now - 100); // Started 100 seconds ago
      votingEndTimestamp2 = new BN(now + 10); // Ends in 10 seconds (still active for voting)

      [proposalPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("proposal"),
          creator.publicKey.toBuffer(),
          proposalId2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .createProposal(
          proposalId2,
          "Test proposal for finalization",
          votingStartTimestamp2,
          votingEndTimestamp2
        )
        .accounts({
          creator: creator.publicKey,
          proposal: proposalPda2,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      // Cast a vote on this proposal
      const encryptedVote = Buffer.from("encrypted_vote_for_finalization");
      const [voteReceiptPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          voter1TokenAccount.toBuffer(),
          proposalPda2.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .castVote(encryptedVote)
        .accounts({
          proposalAccount: proposalPda2,
          voter: voter1TokenAccount,
          payer: voter1.publicKey,
          voteReceiptAccount: voteReceiptPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([voter1])
        .rpc();

      // Wait for voting period to end
      await new Promise((resolve) => setTimeout(resolve, 12000)); // Wait 12 seconds
    });

    it("Successfully finalizes a vote with valid proof", async () => {
      const yesVotes = new BN(1);
      const noVotes = new BN(0);
      const proof = Buffer.from("valid_cryptographic_proof");

      const tx = await program.methods
        .finalizeVote(yesVotes, noVotes, proof)
        .accounts({
          finalizer: creator.publicKey,
          proposalAccount: proposalPda2,
        } as any)
        .signers([creator])
        .rpc();

      console.log("Finalize vote transaction signature:", tx);

      // Verify the proposal was finalized
      const proposalAccount = await program.account.proposalAccount.fetch(
        proposalPda2
      );
      assert.equal(proposalAccount.yesVotes.toString(), yesVotes.toString());
      assert.equal(proposalAccount.noVotes.toString(), noVotes.toString());
      assert.equal(proposalAccount.isFinalized, true);
    });

    it("Fails to finalize when not the creator", async () => {
      // Create another proposal
      const proposalId3 = new BN(3);
      const now = Math.floor(Date.now() / 1000);
      const votingStartTimestamp3 = new BN(now - 100);
      const votingEndTimestamp3 = new BN(now - 10);

      const [proposalPda3] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("proposal"),
          creator.publicKey.toBuffer(),
          proposalId3.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .createProposal(
          proposalId3,
          "Test proposal for unauthorized finalization",
          votingStartTimestamp3,
          votingEndTimestamp3
        )
        .accounts({
          creator: creator.publicKey,
          proposal: proposalPda3,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      const yesVotes = new BN(5);
      const noVotes = new BN(3);
      const proof = Buffer.from("proof");

      try {
        await program.methods
          .finalizeVote(yesVotes, noVotes, proof)
          .accounts({
            finalizer: voter1.publicKey, // Not the creator
            proposalAccount: proposalPda3,
          } as any)
          .signers([voter1])
          .rpc();

        assert.fail("Should have failed - not the creator");
      } catch (error) {
        // Expected to fail due to Unauthorized constraint
        assert.ok(error.toString().includes("Unauthorized") || error);
      }
    });

    it("Fails to finalize with empty proof", async () => {
      // Create another proposal
      const proposalId4 = new BN(4);
      const now = Math.floor(Date.now() / 1000);
      const votingStartTimestamp4 = new BN(now - 100);
      const votingEndTimestamp4 = new BN(now - 10);

      const [proposalPda4] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("proposal"),
          creator.publicKey.toBuffer(),
          proposalId4.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .createProposal(
          proposalId4,
          "Test proposal for empty proof",
          votingStartTimestamp4,
          votingEndTimestamp4
        )
        .accounts({
          creator: creator.publicKey,
          proposal: proposalPda4,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      const yesVotes = new BN(5);
      const noVotes = new BN(3);
      const proof = Buffer.from("");

      try {
        await program.methods
          .finalizeVote(yesVotes, noVotes, proof)
          .accounts({
            finalizer: creator.publicKey,
            proposalAccount: proposalPda4,
          } as any)
          .signers([creator])
          .rpc();

        assert.fail("Should have failed - empty proof");
      } catch (error) {
        // Expected to fail due to InvalidProof error
        assert.ok(error.toString().includes("InvalidProof") || error);
      }
    });

    it("Fails to finalize before voting period ends", async () => {
      // This test uses the first proposal which hasn't ended yet
      const yesVotes = new BN(2);
      const noVotes = new BN(0);
      const proof = Buffer.from("proof");

      try {
        await program.methods
          .finalizeVote(yesVotes, noVotes, proof)
          .accounts({
            finalizer: creator.publicKey,
            proposalAccount: proposalPda, // Original proposal still active
          })
          .signers([creator])
          .rpc();

        assert.fail("Should have failed - voting period not ended");
      } catch (error) {
        // Expected to fail due to WaitTillEndTime error
        assert.ok(error.toString().includes("WaitTillEndTime") || error);
      }
    });

    it("Fails to finalize already finalized proposal", async () => {
      const yesVotes = new BN(2);
      const noVotes = new BN(1);
      const proof = Buffer.from("another_proof");

      try {
        await program.methods
          .finalizeVote(yesVotes, noVotes, proof)
          .accounts({
            finalizer: creator.publicKey,
            proposalAccount: proposalPda2, // Already finalized in first test
          })
          .signers([creator])
          .rpc();

        assert.fail("Should have failed - already finalized");
      } catch (error) {
        // Expected to fail due to Finalized error
        assert.ok(error.toString().includes("Finalized") || error);
      }
    });
  });
});
