// const {
//     clone
// } = require('../includes/setup');

global.helpers = setup.helpers;
global.BN = helpers.BN;
global.MAX_UINT256 = helpers.MAX_UINT256;
global.expect = helpers.expect

const _ = require('lodash');
function clone(_what) {
    return _.cloneDeep(_what);
}

async function deployContract(name, args = {}) {
    
    const contractInstance = await helpers.utils.deployNewContractInstance(
        helpers, name, args
    );

    console.log("      Contract deployed:  ", name);
    console.log("        Gas used:         ", contractInstance.receipt.gasUsed);
    console.log("        Contract Address: ", contractInstance.receipt.contractAddress);
    
    return {
        instance: contractInstance,
        receipt: contractInstance.receipt,
        address: contractInstance.receipt.contractAddress
    }
}

async function deployTokenContract() {
   return await deployContract(
       "RicoToken", 
       {
            from: holder,
            arguments: [
                setup.settings.token.supply.toString(),
                [], // accounts[0] maybe
            ],
            gas: 6500000,
            gasPrice: helpers.solidity.gwei * 10
        }
    );
}

async function deployRICOContract() {
    return await deployContract("ReversibleICOMock");
}


describe("ReversibleICO - Random Withdraw Token Balance", function () {

    const deployingAddress = accounts[0];
    const whitelistingAddress = accounts[1];
    let _TokenContractInstance;
    let _ReversibleICOInstance;
    // generate n participants
    let numberOfParticipants = 2;
    let participants = [];

    const customTestSettings = clone(setup.settings);
    // custom settings for this test
    customTestSettings.rico.startBlockDelay = 11;
    customTestSettings.rico.blocksPerDay = 3;
    customTestSettings.rico.commitPhaseDays = 2;
    customTestSettings.rico.stageDays = 2;
    customTestSettings.rico.stageCount = 10;

    customTestSettings.rico.commitPhasePrice = "25000000000000000"; // 0.025 ETH
    customTestSettings.rico.stagePriceIncrease = "3333333333333333"; // 0.003333... ETH

    let commitPhaseStartBlock = customTestSettings.rico.startBlockDelay;
    let commitPhaseBlockCount = customTestSettings.rico.blocksPerDay * customTestSettings.rico.commitPhaseDays;
    let buyPhaseStartBlock = commitPhaseStartBlock + commitPhaseBlockCount + 1;
    let buyPhaseBlockCount = customTestSettings.rico.blocksPerDay * customTestSettings.rico.stageDays * customTestSettings.rico.stageCount;
    let buyPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount + buyPhaseBlockCount;


    let project = {
        address: projectAddress,
        weiBalance: new BN(0)
    };

    // console.log("accounts: ", accounts);
    // add accounts
    for(let i = 0; i < numberOfParticipants; i++){
        participants[i] = {
            address: accounts[i+15],
            pricesPaid: [],
            pricesAtWithdraw: [],
            tokenBalance: new BN(0)
        };
        // participants[i].weiBalance = getRandomInt(numberOfParticipants) * 1000000000000000000;
    }

    priceInStage = (_stageId) => {
        return new BN(customTestSettings.rico.commitPhasePrice).add(
            new BN(_stageId).mul(
                new BN(customTestSettings.rico.stagePriceIncrease)
            )
        );
    }

    function getRandomInt(max) {
        return Math.floor(Math.random() * Math.floor(max));
    }

    before(async function () {

        const settings = customTestSettings;

        const TokenContract = await deployTokenContract();
        _TokenContractInstance = TokenContract.instance;
        const TokenContractAddress = TokenContract.address;
        // TokenContractReceipt = TokenContract.receipt;

        const RICOContract = await deployRICOContract();
        _ReversibleICOInstance = RICOContract.instance;
        const ReversibleICOAddress = RICOContract.address;
        // ReversibleICOReceipt = RICOContract.receipt;

        // Setup token contract by adding RICO address
        await _TokenContractInstance.methods.setup(
            ReversibleICOAddress
        ).send({
            from: holder,  // initial token supply holder
        });

        if(settings == null) {
            throw "Settings cannot be null";
        }

        /*
        *   Add RICO Settings
        */
       const currentBlock = await _ReversibleICOInstance.methods.getCurrentBlockNumber().call();

        const commitPhaseStartBlock = parseInt(currentBlock, 10) + settings.rico.startBlockDelay;

        // 22 days allocation
        const commitPhaseBlockCount = settings.rico.blocksPerDay * settings.rico.commitPhaseDays;
        const commitPhasePrice = settings.rico.commitPhasePrice;

        // 12 x 30 day periods for distribution
        const stageCount = settings.rico.stageCount;
        const stageBlockCount = settings.rico.blocksPerDay * settings.rico.stageDays;
        const stagePriceIncrease = settings.rico.stagePriceIncrease;

        await _ReversibleICOInstance.methods.init(
            TokenContractAddress,       // address TokenContractAddress
            whitelistingAddress,        // address whitelistingAddress
            projectAddress,             // address _projectAddress
            commitPhaseStartBlock,      // uint256 _commitPhaseStartBlock
            commitPhaseBlockCount,      // uint256 _commitPhaseBlockCount,
            commitPhasePrice,           // uint256 _commitPhasePrice in wei
            stageCount,                 // uint8   _StageCount
            stageBlockCount,            // uint256 _StageBlockCount
            stagePriceIncrease          // uint256 _StagePriceIncrease in wei
        ).send({
            from: deployingAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await _TokenContractInstance.methods.send(
            _ReversibleICOInstance.receipt.contractAddress,
            setup.settings.token.sale.toString(),
            web3.utils.sha3('777TestData')
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
        });

        expect(
            await _TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
        ).to.be.equal(setup.settings.token.sale.toString());

        
        // reinitialize instances so revert works properly.
        // _TokenContractInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenContractAddress);
        // _TokenContractInstance.receipt = TokenContractReceipt;
        // _ReversibleICOInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", ReversibleICOAddress);
        // _ReversibleICOInstance.receipt = ReversibleICOReceipt;
        
        // do some validation
        expect(
            await helpers.utils.getBalance(helpers, ReversibleICOAddress)
        ).to.be.bignumber.equal( new BN(0) );

        let expectedTokenSupply = setup.settings.token.sale.toString();

        expect(await _TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()).to.be.equal(expectedTokenSupply);
        expect(
            await _ReversibleICOInstance.methods.tokenSupply().call()
        ).to.be.equal(
            await _TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
        );

        await _ReversibleICOInstance.methods.jumpToBlockNumber(commitPhaseStartBlock).send({
            from: deployingAddress,
            gas: 100000
        });
    });

    const blockTasks =  { '11':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 },
   '12':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 2,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '13':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '14':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
   '15':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 2,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '16':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 },
   '17':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
   '18':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 9,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 2 },
   '19':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 9,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '20':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '21':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 },
   '34':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 1 },
   '35':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 6,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 7 },
   '36':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 7,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 },
   '37':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 2,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
   '38':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '39':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 1 },
   '40':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '41':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 1,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 2 },
   '42':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 7 },
   '43':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 3,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 8 },
   '44':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '45':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 8 },
   '46':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 7,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '47':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 1,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '48':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '49':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '50':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 7,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '51':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 7 },
   '52':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 2,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 7 },
   '53':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '54':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 1 },
   '55':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '56':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 2 },
   '57':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 6,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '58':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '59':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '60':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 6,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
   '61':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '62':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 1 },
   '63':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 2,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 1 },
   '64':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 3,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 },
   '65':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '66':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '67':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '68':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '69':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 4,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
   '70':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '71':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '72':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '73':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 9,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 8 },
   '74':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 7,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '75':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 7,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '76':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 6,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 6 },
   '77':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 9,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 2 },
   '78': 
    {  '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 1,
       '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '79':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 3,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 1 },
   '80':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
   '81':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 9,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 },
   '82':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 6,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 4 },
   '83':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 2,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '84':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 9,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '85':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 5,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 3 },
   '86':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 9 },
   '87':
    { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 7,
      '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 5 } }

    let blockContrib = {};
    let blockReturn = {};

    blockContrib = { '34': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 65 },
    '39': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 38 },
    '41': { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 82 },
    '47': { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 8 },
    '54': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 60 },
    '62': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 20 },
    '63': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 59 },
    '78': { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 23 },
    '79': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 30 } }
    blockReturn =  { '12': { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0 },
    '15': { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0 },
    '18': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
    '37': { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': 0 },
    '41': { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': 0 },
    '52':
     { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': "67794238685799450000" },
    '56':
     { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': "19620804142248337000" },
    '63':
     { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': "1520789183170938600" },
    '77':
     { '0xd1C8b68bF03b7df27B63060fF2ed34D270350ca2': "64104037756251800000" },
    '83':
     { '0x0711D90e5264E6DA71DcEaDbf4ac7C54120d7b89': "8157867966035315000" } }

    // iterate over all phases
    //commitPhaseStartBlock
    for (let blockNumber = commitPhaseStartBlock; blockNumber < buyPhaseEndBlock + 11 /* add frozen period */; blockNumber++) {

        console.log('Current Block: ', blockNumber);

        if(blockNumber == 22) {
            it("Freeze contract at block "+ blockNumber, async function () {
                // freeze contract in the middle
                await _ReversibleICOInstance.methods.freeze().send({
                    from: projectAddress,
                    gas: 1000000
                });
            });
        }

        if(blockNumber == 33) {
            it("Unfreeze contract at block "+ blockNumber, async function () {
                // freeze contract in the middle
                await _ReversibleICOInstance.methods.unfreeze().send({
                    from: projectAddress,
                    gas: 1000000
                });
            });
        }

        if(blockNumber < 22 || blockNumber > 33) {

            // go over every participant
            for (let i = 0; i < numberOfParticipants; i++) {
            let participant = participants[i];

            // we have 10, so that in 70% there is no actions, as only 3 numbers represent actions
            let task = getRandomInt(10);

            // if(!blockTasks[blockNumber]) {
            //     blockTasks[blockNumber] = {};
            // }
            // blockTasks[blockNumber][participant.address] = task;

            task = blockTasks[blockNumber][participant.address];

            let taskName = '';
            if(task === 1)
                taskName = 'CONTRIBUTE';
            if(task === 2)
                taskName = 'WITHDRAW';
            if(task === 3)
                taskName = 'PROJECT WITHDRAW';

            console.log(participant.address +' Task: ' + taskName + ' '+ task);

            // if(!participants[i].contrCount)
            //     participants[i].contrCount = 0;
            // if(!participants[i].withdCount)
            //     participants[i].withdCount = 0;

            // CONTRIBUTE
            if(task === 1) {// && participants[i].contrCount <= 3) {

                // participants[i].contrCount++;


                it(participant.address + ": Buy tokens", function (done) {


                    ( async function(){
                        // WHITELIST
                        let particip = await _ReversibleICOInstance.methods.participants(participant.address).call();
                        let stage = await _ReversibleICOInstance.methods.getCurrentStage().call();

                        if (!particip.whitelisted && stage >= 2) {
                            await _ReversibleICOInstance.methods.whitelist(
                                [participant.address],
                                true
                            ).send({
                                from: whitelistingAddress
                            }).then((receipt) => {

                                particip.whitelisted = true;

                                console.log('---> Whitelisting: ', receipt.gasUsed + ' GAS');

                            }).catch(done);
                        }

                        // calc random token amount
                        // user balance: 1000000 ETH?
                        // const amt = getRandomInt(100);
                        const amt = blockContrib[blockNumber][participant.address];
                        const contribTokenAmount = new BN(amt); // 0-100 tokens //

                        // if(!blockContrib[blockNumber]) {
                        //     blockContrib[blockNumber] = {};
                        // }
                        // blockContrib[blockNumber][participant.address] = amt;


                        const stageId = await _ReversibleICOInstance.methods.getCurrentStage().call();
                        const currentPrice = await _ReversibleICOInstance.methods.getCurrentPrice().call();

                        if (contribTokenAmount.toString() > '0') {
                            const ContributionAmount = priceInStage(stageId).mul(contribTokenAmount);
                            await helpers.web3Instance.eth.sendTransaction({
                                from: participant.address,
                                to: _ReversibleICOInstance.receipt.contractAddress,
                                value: ContributionAmount.toString(),
                                data: '0x3c7a3aff', // commit()
                                gasPrice: helpers.networkConfig.gasPrice
                            }).then((receipt) => {

                                let text = (particip.whitelisted) ? 'with auto accepting :': ':';

                                console.log('---> Contribution '+ text, receipt.gasUsed + ' GAS');

                                // update his balance
                                participant.pricesPaid.push(new BN(currentPrice));
                                participant.tokenBalance = participant.tokenBalance.add(contribTokenAmount.mul(new BN('1000000000000000000')));

                                done();
                            }, (error) => {
                                helpers.utils.resetAccountNonceCache(helpers);
                                done(error);
                            });

                        } else {
                            done();
                        }
                    })();
                });
            }
            // WITHDRAW
            if(task === 2) {// && participants[i].withdCount <= 3) {

                // participants[i].withdCount++;


                it(participant.address + ": Return tokens", function (done) {


                    ( async function(){
                        const maxTokens = await _ReversibleICOInstance.methods.getParticipantReservedTokens(participant.address).call();
                        // const maxTokens = await _TokenContractInstance.methods.balanceOf(participant.address).call();

                        // calc random token amount
                        // const amt = getRandomInt(maxTokens);
                        const amt = blockReturn[blockNumber][participant.address];
                        const returnTokenAmount = new BN(String(amt));//getRandomInt(maxTokens))); // 0-max reserved tokens

                        console.log("maxTokens:", maxTokens, "amount:", amt);
                        // if(!blockReturn[blockNumber]) {
                        //     blockReturn[blockNumber] = {};
                        // }
                        // blockReturn[blockNumber][participant.address] = amt;

                        if(returnTokenAmount.toString() > '0') {

                            await _TokenContractInstance.methods.transfer(_ReversibleICOInstance.receipt.contractAddress, returnTokenAmount.toString()).send({from: participant.address, gas: 1000000})
                                .then(async (receipt) => {

                                    // console.log('returnTokenAmount', returnTokenAmount.toString());
                                    // console.log('DEBUG1', await _ReversibleICOInstance.methods.DEBUG1().call());
                                    // console.log('DEBUG2', await _ReversibleICOInstance.methods.DEBUG2().call());
                                    // console.log('DEBUG3', await _ReversibleICOInstance.methods.DEBUG3().call());
                                    // console.log('DEBUG4', await _ReversibleICOInstance.methods.DEBUG4().call());

                                    console.log('---> Withdraw: ', receipt.gasUsed + ' GAS');


                                    // update his balance
                                    participant.tokenBalance = participant.tokenBalance.sub(returnTokenAmount);

                                    if(receipt.events['0']) {
                                        let pow18 = new BN(10).pow(new BN(18));

                                        // console.log('RET TOKEN', returnTokenAmount.toString());
                                        // console.log('ETH RETURNED', new BN(receipt.events[0].raw.topics[3].replace('0x',''), 16).toString());

                                        participant.pricesAtWithdraw.push(
                                            new BN(receipt.events[0].raw.topics[3].replace('0x',''), 16).mul(pow18)
                                                .div(returnTokenAmount)
                                                // .mul(new BN('1000000000000000000')) // * 1 ETH
                                        );
                                    }

                                    done();
                                }, (error) => {
                                    helpers.utils.resetAccountNonceCache(helpers);
                                    done(error);
                                });

                        } else {
                            done();
                        }
                    })();

                });
            }


            // PROJECT WITHDRAW
            if(task === 3) {
                it(project.address +" Project: Withdraws ETH", function (done) {

                    ( async function(){
                        const getAvailableProjectETH = await _ReversibleICOInstance.methods.getAvailableProjectETH().call();

                        // withdraw everything the project can at that point in time
                        await _ReversibleICOInstance.methods.projectWithdraw(getAvailableProjectETH).send({
                            from: project.address,
                            gas: 1000000
                        }).then((receipt) => {

                            console.log('---> Project withdraw: ', receipt.gasUsed + ' GAS');


                            project.weiBalance = project.weiBalance.add(new BN(getAvailableProjectETH));

                            done();
                        }, (error) => {
                            helpers.utils.resetAccountNonceCache(helpers);
                            done(error);
                        });
                    })();
                });
            }

        }

        }

        it("Jump to the next block: "+ blockNumber, async function () {
            // jump to the next block
            await _ReversibleICOInstance.methods.jumpToBlockNumber(blockNumber).send({
                from: deployingAddress,
                gas: 100000
            });

            const stage = await _ReversibleICOInstance.methods.getCurrentStage().call();
            const price = await _ReversibleICOInstance.methods.getCurrentPrice().call();

            console.log('Stage: '+ stage + ', Price: '+ price);
        });
    }


    // for(let _i = 11; _i < 87; _i++) {
    //     console.log('blockTasks: ', blockTasks[_i]);
    // }

    console.log('Number of Participants: ', numberOfParticipants);

    it("rICO should be finished", async function () {
        const blockNumber = await _ReversibleICOInstance.methods.getCurrentBlockNumber().call();
        const buyPhaseEndBlock = await _ReversibleICOInstance.methods.buyPhaseEndBlock().call();
        expect(blockNumber).to.be.equal(buyPhaseEndBlock);
    });

    // it("rICO should have all committed ETH as balance", async function () {
    //     const committedEth = await _ReversibleICOInstance.methods.committedETH().call();
    //     const rICOEthbalance = await helpers.web3Instance.eth.getBalance(_ReversibleICOInstance.receipt.contractAddress);
    //     expect(committedEth).to.be.equal(rICOEthbalance);
    // });

    it("rICO balance - getAvailableProjectETH should be 0", async function () {
        const rICOEthbalance = await helpers.web3Instance.eth.getBalance(_ReversibleICOInstance.receipt.contractAddress);
        const getAvailableProjectETH = await _ReversibleICOInstance.methods.getAvailableProjectETH().call();
        expect(new BN(rICOEthbalance).sub(new BN(getAvailableProjectETH)).toString()).to.be.equal('0');
    });

    it("rICO rest balance should be no more or less than 0% off to what was ever committed ETH", async function () {
        const rICOEthbalance = await helpers.web3Instance.eth.getBalance(_ReversibleICOInstance.receipt.contractAddress);
        const getAvailableProjectETH = await _ReversibleICOInstance.methods.getAvailableProjectETH().call();
        const difference = new BN(rICOEthbalance).sub(new BN(getAvailableProjectETH));
        const committedETH = await _ReversibleICOInstance.methods.committedETH().call();
        // console.log('difference', difference.mul(new BN(10000)).toString());
        // console.log('committedETH', committedETH);
        // console.log('result', difference.mul(new BN(10000)).div(new BN(committedETH)).toString());
        expect(difference.mul(new BN(10000)).div(new BN(committedETH)).toString() / 10000 * 100 + '%').to.be.equal('0%');
    });

    it("rICO balance should have all getAvailableProjectETH still", async function () {
        const rICOEthbalance = await helpers.web3Instance.eth.getBalance(_ReversibleICOInstance.receipt.contractAddress);
        const getAvailableProjectETH = await _ReversibleICOInstance.methods.getAvailableProjectETH().call();
        expect(rICOEthbalance).to.be.equal(getAvailableProjectETH);
    });

    it("Project balance + getAvailableProjectETH should be committedETH", async function () {
        const committedETH = await _ReversibleICOInstance.methods.committedETH().call();
        const getAvailableProjectETH = await _ReversibleICOInstance.methods.getAvailableProjectETH().call();
        expect(project.weiBalance.add(new BN(getAvailableProjectETH)).toString()).to.be.equal(committedETH);
    });

    it("Project should have all projectWithdrawnETH", async function () {
        const projectWithdrawnETH = await _ReversibleICOInstance.methods.projectWithdrawnETH().call();
        expect(project.weiBalance.toString()).to.be.equal(projectWithdrawnETH);
    });

    it(participants[0].address + ": compare full token balances", async function () {
        const balance = await _TokenContractInstance.methods.balanceOf(participants[0].address).call();
        expect(balance).to.be.equal(participants[0].tokenBalance.toString());
    });

    // go over every participant
    for (let i = 0; i < numberOfParticipants; i++) {
        let participant = participants[i];

        it(participant.address + ": compare full token balances",  function () {
            console.log("contractAddress:", _TokenContractInstance.receipt.contractAddress)
            return _TokenContractInstance.methods.balanceOf(participant.address).call().then(balance => {
                expect(balance).to.be.equal(participant.tokenBalance.toString());
            })
        });

        it(participant.address + ": reserved token balance should be 0", async function () {
            const getParticipantReservedTokens = await _ReversibleICOInstance.methods.getParticipantReservedTokens(participant.address).call();
            expect(getParticipantReservedTokens).to.be.equal("0");
        });
        
        it(participant.address + ": unlocked token balance should be all bought tokens", async function () {
            // const getParticipantReservedTokens = await _ReversibleICOInstance.methods.getParticipantReservedTokens(participant.address).call();
            // expect(participant.tokenBalance.sub(getParticipantReservedTokens).toString()).to.be.equal(participant.tokenBalance.toString());
            const getParticipantUnlockedTokens = await _ReversibleICOInstance.methods.getParticipantUnlockedTokens(participant.address).call();
            expect(getParticipantUnlockedTokens).to.be.equal(participant.tokenBalance.toString());
        });

        it(participant.address + ": compare price average, should be 0", async function () {

            let pricesPaidSum = new BN(0);
            participant.pricesPaid.forEach((price, i) => {
                // console.log('Compare paid '+i, price.toString());
                pricesPaidSum = pricesPaidSum.add(price);
            });

            let pricesWithdrawnSum = new BN(0);
            participant.pricesAtWithdraw.forEach((price, i) => {
                // console.log('Compare withdraw '+i, price.toString());
                pricesWithdrawnSum = pricesWithdrawnSum.add(price);
            });


            console.log('Participant Stats: '+ participant.address, await _ReversibleICOInstance.methods.participants(participant.address).call());

            console.log('-------');
            if(participant.pricesPaid.length)
                console.log('Compare prices paid ', pricesPaidSum.div(new BN(participant.pricesPaid.length)).toString());

            if(participant.pricesAtWithdraw.length)
                console.log('Compare prices withdraw ', pricesWithdrawnSum.div(new BN(participant.pricesAtWithdraw.length)).toString());

            // if(participant.pricesAtWithdraw.length && participant.pricesPaid.length)
            //     let difference = pricesWithdrawnSum.div(new BN(participant.pricesAtWithdraw.length)).sub(pricesPaidSum.div(new BN(participant.pricesPaid.length)));

            // expect(difference.mul(new BN(10000)).div(pricesPaidSum.div(new BN(participant.pricesPaid.length))).toString() / 10000 * 100 + '%').to.be.equal('0%');

        });
    }

    // it("end", async function () {

    //     console.log('blockContrib: ', blockContrib);
    //     console.log('blockReturn: ', blockReturn);
    
    // });


});