/*
 * The deployer
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const Participant = require("./participant.js");

module.exports = {
    async run (init, settings) {

        const helpers = init.setup.helpers;
        const expect = helpers.expect;

        const ContractsDeployer = settings.ContractsDeployer;
        const whitelistingAddress = settings.whitelistingAddress;
        const projectAddress = settings.projectAddress;
        const blocksPerDay = settings.blocksPerDay // 6450;
        const commitPhaseDays = settings.commitPhaseDays // 22;
        const StageDays = settings.StageDays // 30;
        
        const RicoSaleSupply = init.setup.settings.token.sale.toString();
        const ERC777data = helpers.web3Instance.utils.sha3('777TestData');

        /*
         * Deployment - ERC1820
         */
        console.log("    Deploying ERC1820 Contract");
        let deploymentTx = await this.deployERC1820 (init);
        console.log("      Gas used for deployment:", deploymentTx.gasUsed);
        console.log("      Contract Address:", deploymentTx.contractAddress);
        console.log("");

        /*
         * Deployment - rICO Token Contract
         */
        console.log("    Deploying rICO Token Contract");
        deploymentTx = await this.deployrICOToken(init, ContractsDeployer);
        console.log("      Gas used for deployment:", deploymentTx.gasUsed);
        console.log("      Contract Address:", deploymentTx.contractAddress);
        console.log("");

        /*
         * Deployment - rICO Contract
         */

        console.log("    Deploying rICO Contract");
        deploymentTx = await this.deployrICO(init, ContractsDeployer);
        console.log("      Gas used for deployment:", deploymentTx.gasUsed);
        console.log("      Contract Address:", deploymentTx.contractAddress);
        console.log("");


        /*
         * Setup - Token
         */
        // Add rICO contract into token contract
        const rICOToken = await helpers.utils.getContractInstance(helpers, "RicoToken", helpers.addresses.Token);
        await rICOToken.methods.init(
            helpers.addresses.Rico,
            ContractsDeployer,
            ContractsDeployer,
            ContractsDeployer,
            init.setup.settings.token.supply.toString()
        ).send({
            from: ContractsDeployer,  // initial token supply holder
        });

        /*
         * Setup - rICO - 1 - add Settings
         */
        const rICO = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", helpers.addresses.Rico);

        const currentBlock = await helpers.web3Instance.eth.getBlockNumber();

        // starts in one day
        const commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 22 days allocation
        const commitPhaseBlockCount = blocksPerDay * commitPhaseDays;
        const commitPhasePrice = settings.commitPhasePrice; //  helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        const StageCount = settings.StageCount;
        const StageBlockCount = blocksPerDay * StageDays;
        const StagePriceIncrease = settings.StagePriceIncrease; // helpers.solidity.ether * 0.0001;

        await rICO.methods.init(
            helpers.addresses.Token,     // address _tokenAddress
            whitelistingAddress,  // address _whitelistingAddress
            projectAddress,        // address _freezerAddress
            projectAddress,        // address _rescuerAddress
            projectAddress,        // address _projectAddress
            commitPhaseStartBlock,       // uint256 _commitPhaseStartBlock
            commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
            commitPhasePrice,            // uint256 _commitPhasePrice in wei
            StageCount,                  // uint8   _stageCount
            StageBlockCount,             // uint256 _stageBlockCount
            StagePriceIncrease           // uint256 _stagePriceIncrease in wei
        ).send({
            from: ContractsDeployer,  // deployer
            gas: 3000000
        });

        expect(await rICO.methods.initialized().call()).to.be.equal(true);

        /*
         * Setup - rICO - 2 - add Tokens
         */
        // send all tokens to projectAddress
        await rICOToken.methods.send(
            projectAddress,
            init.setup.settings.token.supply.toString(),
            ERC777data
        ).send({
            from: ContractsDeployer,  // initial token supply holder
            gas: 200000
        });
        
        // send sale supply to rico
        await rICOToken.methods.send(
            helpers.addresses.Rico,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: projectAddress,  // initial token supply holder
            gas: 200000
        });

        return {
            addresses: {
                ContractsDeployer: ContractsDeployer,
                whitelistingAddress: whitelistingAddress,
                projectAddress: projectAddress,
            },
            contracts: {
                rICOToken:rICOToken,
                rICO:rICO
            },
            cache: {
                commitPhaseStartBlock: await rICO.methods.commitPhaseStartBlock().call(),
                commitPhaseEndBlock: await rICO.methods.commitPhaseEndBlock().call(),
                buyPhaseStartBlock: await rICO.methods.buyPhaseStartBlock().call(),
                buyPhaseEndBlock: await rICO.methods.buyPhaseEndBlock().call()
            }
        }
    },
    async deployERC1820 (init) {

        const helpers = init.setup.helpers;
        const expect = helpers.expect

        let ContractCode = await new helpers.web3Instance.eth.getCode(helpers.ERC1820.ContractAddress);
        expect( ContractCode ).to.be.equal( "0x" );

        let SenderBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.SenderAddress);
        expect( SenderBalance ).to.be.bignumber.equal( '0' );

        const SupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);
        let deploymentCost = new helpers.BN( helpers.ERC1820.deploymentCost.toString() );
        expect( SupplierBalance ).to.be.bignumber.above( deploymentCost );

        txGasPrice = 20000000000; // 20 gwei
        const initialFundsSupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);

        // transfer deploymentCost from SupplierBalance to SenderAddress and validate
        const valueTransferTx = await helpers.web3Instance.eth.sendTransaction({
            from: helpers.ERC1820.FundsSupplierAddress,
            to: helpers.ERC1820.SenderAddress,
            value: helpers.ERC1820.deploymentCost.toString(),
            gasPrice: txGasPrice,
        });

        // FundsSupplier balance has deploymentCost + tx fee substracted
        const newSupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);
        // gas used
        let combinedValue = new helpers.BN( valueTransferTx.gasUsed.toString() )
        // times gas price
        combinedValue = combinedValue.mul( new helpers.BN( txGasPrice ) );
        // add value sent
        combinedValue = combinedValue.add( new helpers.BN( helpers.ERC1820.deploymentCost.toString() ) );
        // initial minus sent + gas * gas price
        const newCalculatedBalance = initialFundsSupplierBalance.sub(combinedValue);
        expect( newSupplierBalance ).to.be.bignumber.equal( newCalculatedBalance );


        // SenderAddress balance is equal to deploymentCost
        SenderBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.SenderAddress);
        deploymentCost = new helpers.BN( helpers.ERC1820.deploymentCost.toString() );
        expect( SenderBalance ).to.be.bignumber.equal( deploymentCost );

        // sendRawTransaction if upgrading to the latest web3
        const deploymentTx = await helpers.web3Instance.eth.sendSignedTransaction( helpers.ERC1820.RawTx );

        // Transaction status
        expect( deploymentTx.status ).to.be.equal( true );

        // signature is valid
        expect( deploymentTx.v ).to.be.equal( helpers.ERC1820.sig.v );
        expect( deploymentTx.r ).to.be.equal( helpers.ERC1820.sig.r );
        expect( deploymentTx.s ).to.be.equal( helpers.ERC1820.sig.s );

        // from address is correct
        expect( deploymentTx.from ).to.be.equal( helpers.ERC1820.SenderAddress.toLowerCase() );

        // Contract address is 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
        expect( deploymentTx.contractAddress ).to.be.equal( helpers.ERC1820.ContractAddress );

        // setup contract instance
        helpers.ERC1820.instance = await new helpers.web3Instance.eth.Contract( helpers.ERC1820.abi, helpers.ERC1820.ContractAddress );
    

        // code at address exists
        ContractCode = await new helpers.web3Instance.eth.getCode(helpers.ERC1820.ContractAddress);
        expect( ContractCode.length ).to.be.equal( 5004 );
    
        // contract has the getManager method which can be called
        const getManager = await helpers.ERC1820.instance.methods.getManager( accounts[0] ).call();
        expect( getManager ).to.be.equal( accounts[0] );

        return deploymentTx;
    },
    async deployrICOToken(init, ContractsDeployer) {

        const helpers = init.setup.helpers;
        const setup = init.setup;
        const expect = helpers.expect
        const defaultOperators = [];

        if (helpers.ERC1820.instance == false) {
            console.log(
                "  Error: ERC1820.instance not found, please make sure to run it first."
            );
            process.exit();
        }

        const rICOToken = await helpers.utils.deployNewContractInstance(
            helpers,
            "RicoToken",
            {
                from: ContractsDeployer,
                arguments: [defaultOperators],
                gas: 6500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );

        expect(await rICOToken.methods.name().call()).to.equal(
            setup.settings.token.name
        );
        expect(await rICOToken.methods.symbol().call()).to.equal(
            setup.settings.token.symbol
        );
        expect(await rICOToken.methods.granularity().call()).to.be.equal(
            "1"
        );

        helpers.addresses.Token = rICOToken.receipt.contractAddress;
        return rICOToken.receipt;
    },
    async deployrICO(init, ContractsDeployer) {

        const helpers = init.setup.helpers;
        const expect = helpers.expect

        if (helpers.ERC1820.instance == false) {
            console.log(
                "  Error: ERC1820.instance not found, please make sure to run it first."
            );
            process.exit();
        }

        const ReversibleICO = await helpers.utils.deployNewContractInstance(
            helpers, "ReversibleICOMock", {from: ContractsDeployer}
        );
        expect(await ReversibleICO.methods.deployingAddress().call()).to.be.equal(ContractsDeployer);
        helpers.addresses.Rico = ReversibleICO.receipt.contractAddress;

        expect(await ReversibleICO.methods.initialized().call()).to.be.equal(false);

        return ReversibleICO.receipt;
    },
    async createLightwallet(init, numAddresses) {
        const helpers = init.setup.helpers;
        const util = require("util");
        const lightwallet = require("eth-lightwallet");

        // Create lightwallet accounts
        const createVault = util
            .promisify(lightwallet.keystore.createVault)
            .bind(lightwallet.keystore);
        const keystore = await createVault({
            hdPathString: "m/44'/60'/0'/0",
            seedPhrase:
                "pull rent tower word science patrol economy legal yellow kit frequent fat",
            password: "test",
            salt: "testsalt"
        });
        const keyFromPassword = await util
            .promisify(keystore.keyFromPassword)
            .bind(keystore)("test");
        keystore.generateNewAddress(keyFromPassword, numAddresses);
    
        // convert signers to proper checksummed addresses
        const accounts = keystore.getAddresses().map((value) => {
            return {
                address: helpers.web3.utils.toChecksumAddress(value),
                pwDerivedKey: keyFromPassword,
                privateKey: keystore.exportPrivateKey(value, keyFromPassword),
            };
        });
    
        return {
            lightwallet: lightwallet,
            keystore: keystore,
            accounts: accounts,
            passwords: keyFromPassword
        };
    },
    async createParticipants(init, numberOfParticipants, participantTxBalance) {

        const helpers = init.setup.helpers;
        const BN = helpers.BN;
        const expect = helpers.expect

        console.log("    Creating "+numberOfParticipants+" participants");
        console.log("      Funding Addresses with ETH ranging from 1 to 50 ( +1 for tx gas costs )");

        const wallet = await this.createLightwallet(init, numberOfParticipants);
        const txGasPrice = 20000000000; // 20 gwei
        const initialFundsSupplier = init.accounts[0];

        const participants = [];
        // since ganache is synchronous. no point in complicating things.
        for(let i = 0; i < wallet.accounts.length; i++) {
            const account = wallet.accounts[i];

            const value = helpers.solidity.etherBN.mul(
                new BN( 100 )
            );
            
            // random values disabled.
            // value = helpers.solidity.etherBN.mul(
            //     new BN( Math.floor(Math.random() * 50) + 1 )
            // );
            
            const actualValue = value.add(
                // add extra eth for tx costs
                participantTxBalance
            );

            const initialAccountBalance = await helpers.utils.getBalance(helpers, account.address);
            expect( initialAccountBalance ).to.be.bignumber.equal( '0', 'initialAccountBalance');

            const initialFundsSupplierBalance = await helpers.utils.getBalance(helpers, initialFundsSupplier);

            // transfer ETH from initialFundsSupplier to Participant and validate
            const valueTransferTx = await helpers.web3Instance.eth.sendTransaction({
                from: initialFundsSupplier,
                to: account.address,
                value: actualValue,
                gasPrice: txGasPrice,
            });

            // validate supplier balance
            const newSupplierBalance = await helpers.utils.getBalance(helpers, initialFundsSupplier);
            let combinedValue = new helpers.BN( valueTransferTx.gasUsed.toString() )
            combinedValue = combinedValue.mul( new helpers.BN( txGasPrice ) );
            combinedValue = combinedValue.add( actualValue );
            const newCalculatedBalance = initialFundsSupplierBalance.sub(combinedValue);
            expect( newSupplierBalance ).to.be.bignumber.equal( newCalculatedBalance, 'newCalculatedBalance');
            
            // validate participant balance
            const newAccountBalance = await helpers.utils.getBalance(helpers, account.address);
            expect( newAccountBalance ).to.be.bignumber.equal( actualValue , 'newAccountBalance');

            console.log("      ["+i+"]", account.address, helpers.utils.toEth(helpers, value) + " eth" );

            participants.push( 
                new Participant( {init, wallet, account}, value, participantTxBalance)
            );
        }

        return participants;
    }


} 