use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;
    
    pub struct UserVote {
        vote : bool
    }

    pub struct VoteStats {
        yes : u64,
        no : u64
    }

    #[instruction]
    pub fn init_vote_stats(mxe : Mxe) -> Enc<Mxe, VoteStats> {
        let vote_stats = VoteStats { yes: 0, no: 0 }; 
       mxe.from_arcis(vote_stats) 
    }

    /// Using Shared Owner
    #[instruction]
    pub fn vote(vote_ctx: Enc<Shared, UserVote>, vote_stats_ctx : Enc<Mxe, VoteStats>)  -> Enc<Mxe, VoteStats> {
        let user_vote = vote_ctx.to_arcis();
        let mut vote_stats = vote_stats_ctx.to_arcis();

        if user_vote.vote {
            vote_stats.yes += 1;
        } else {
            vote_stats.no += 1;
        }

        vote_stats_ctx.owner.from_arcis(vote_stats)
    }

    #[instruction]
    pub fn reveal_result(vote_stats_ctx : Enc<Mxe, VoteStats>) -> bool {
        let vote_stats = vote_stats_ctx.to_arcis();
        (vote_stats.yes > vote_stats.no).reveal()
    }
}
