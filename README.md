There is a User account, who can be a DAO Member or a DAO Administrator. DAO Members can vote, and DAO Administrators can
create proposals. To establish the organization, there is a single, primary MintAccount representing the DAO's official
governance token, which is created once and is owned by the Token Program. To become a member of this organization, a
user must have a governance token in their TokenAccount for that particular MintAccount; this TokenAccount is also owned
by the Token Program, but the user is its owner and must use their private key to sign for any actions.

Now, when a new vote needs to happen, a DAO Administrator with enough lamports for rent calls an instruction to create a
Proposal account, which is a PDA owned by our DAO Program. This Proposal account is not a new MintAccount. Now, users who
are members of the organization can vote on this proposal. They prove their eligibility by using their existing
TokenAccount that holds the DAO's governance token. Once a member votes on that specific proposal, the program creates a
particular PDA called a VoteReceipt account for that user and proposal, which is blank to save on rent and gas fees. And
as the vote is cast, the total vote count is increased in the Proposal Account (PDA).

Finally, once the voting period defined in the Proposal account has ended, an authorized user calls the finalize_vote
instruction. This step updates the yes_votes and no_votes within the Proposal account and sets the is_finalized flag to
true, permanently closing the vote and making the results public. This describes the complete on-chain lifecycle of a
vote before integrating the confidential components like Arcium.
