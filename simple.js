

class rICO
{
    constructor() {

        this.block = 1;
        this.blockCount = 100;
        this.balances = [];
    }

    setBlock(block) {
        this.block = block;
    }

    getRatio() {
        return this.block * 100 / this.blockCount;
    }

    commit(address, eth) {

        // do not allocate to project. 
        // contract eth just increases, and ProjectAvailable will include it

        this.balances[address] = eth;

        // increase number of tokens
    }

    withdraw(address, amount) {
        // do not allocate to project. 
        // based on tokens we return, get eth to return
        // decrease number of tokens


        // allocated_by_withdraw
    }

    projectAvailable() {

        /*

            pending_in_contract = total_received - total_commited - withdrawn;

            available_in_contract = total_commited (accepted contributions total) - withdrawn;

            
            allocated_by_commit
            allocated_by_withdraw
            

            var unlockedPercentage = this.block / (buyEndBlock - buyStartBlock) (duration);
            var unlockedPercentage = this.block / (buyEndBlock - lastWithdrawBlock)(duration);

            unlocked = (available_in_contract - allocated) * unlockedPercentage
            
            available = allocated - withdrawn_by_project + unlocked;




            global



        */

    }

    projectWithdraw(amount) {
        // 

    }

}


/*
 user commits 50 at block 50
 - project available = 25
 - user available = 25

 user withdraws 25
 - project available is 12.5 -> should be 25.. 
 
 * allocate "unlocked amount" to project 
 * subtract unlocked amount from global available 





  allocatedEthAmount


 */

