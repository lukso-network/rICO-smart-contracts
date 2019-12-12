pragma solidity ^0.5.0;


library SafeMath {
    
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath: subtraction overflow");
        uint256 c = a - b;

        return c;
    }

    
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        
        
        
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        
        require(b > 0, "SafeMath: division by zero");
        uint256 c = a / b;
        

        return c;
    }

    
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0, "SafeMath: modulo by zero");
        return a % b;
    }
}

interface IERC777 {
    
    function name() external view returns (string memory);

    
    function symbol() external view returns (string memory);

    
    function granularity() external view returns (uint256);

    
    function totalSupply() external view returns (uint256);

    
    function balanceOf(address owner) external view returns (uint256);

    
    function send(address recipient, uint256 amount, bytes calldata data) external;

    
    function burn(uint256 amount, bytes calldata data) external;

    
    function isOperatorFor(address operator, address tokenHolder) external view returns (bool);

    
    function authorizeOperator(address operator) external;

    
    function revokeOperator(address operator) external;

    
    function defaultOperators() external view returns (address[] memory);

    
    function operatorSend(
        address sender,
        address recipient,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external;

    
    function operatorBurn(
        address account,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external;

    event Sent(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes data,
        bytes operatorData
    );

    event Minted(address indexed operator, address indexed to, uint256 amount, bytes data, bytes operatorData);

    event Burned(address indexed operator, address indexed from, uint256 amount, bytes data, bytes operatorData);

    event AuthorizedOperator(address indexed operator, address indexed tokenHolder);

    event RevokedOperator(address indexed operator, address indexed tokenHolder);
}

interface IERC777Recipient {
    
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external;
}

interface IERC1820Registry {
    
    function setManager(address account, address newManager) external;

    
    function getManager(address account) external view returns (address);

    
    function setInterfaceImplementer(address account, bytes32 interfaceHash, address implementer) external;

    
    function getInterfaceImplementer(address account, bytes32 interfaceHash) external view returns (address);

    
    function interfaceHash(string calldata interfaceName) external pure returns (bytes32);

    
    function updateERC165Cache(address account, bytes4 interfaceId) external;

    
    function implementsERC165Interface(address account, bytes4 interfaceId) external view returns (bool);

    
    function implementsERC165InterfaceNoCache(address account, bytes4 interfaceId) external view returns (bool);

    event InterfaceImplementerSet(address indexed account, bytes32 indexed interfaceHash, address indexed implementer);

    event ManagerChanged(address indexed account, address indexed newManager);
}

contract ReversibleICO is IERC777Recipient {

    
    using SafeMath for uint256;

    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    IERC777 public tokenContract;

    
    bool public initialized; 
    bool public frozen; 
    bool public started; 
    bool public ended; 

    
    address public deployerAddress;
    address public tokenContractAddress;
    address public projectWalletAddress;
    address public whitelistControllerAddress;

    
    uint256 public tokenSupply; 

    uint256 public totalReceivedETH;
    uint256 public returnedETH; 
    uint256 public committedETH;
    uint256 public withdrawnETH; 

    uint256 public projectWithdrawCount; 
    uint256 public projectAllocatedETH; 
    uint256 public projectWithdrawnETH; 

    
    
    uint256 public minContribution = 0.001 ether;

    
    uint256 public commitPhasePrice;
    uint256 public commitPhaseStartBlock;
    uint256 public commitPhaseEndBlock;
    uint256 public commitPhaseBlockCount;

    uint256 public buyPhaseStartBlock;
    uint256 public buyPhaseEndBlock;
    uint256 public buyPhaseBlockCount;

    uint256 public stageBlockCount;

    
    struct Stage {
        uint256 startBlock;
        uint256 endBlock;
        uint256 tokenPrice;
    }

    mapping ( uint8 => Stage ) public stages;
    uint8 public stageCount; 

    

    struct Participant {
        bool   whitelisted;
        uint32  contributionsCount;
        uint256 totalReceivedETH;
        uint256 returnedETH;	        
        uint256 committedETH;
        uint256 withdrawnETH;	        
        uint256 allocatedETH;              
        uint256 reservedTokens;         
        uint256 boughtTokens;	        
        uint256 returnedTokens;         
        mapping ( uint8 => ParticipantDetailsByStage ) byStage;
    }

    mapping ( address => Participant ) public participantsByAddress;
    mapping ( uint256 => address ) public participantsById;
    uint256 public participantCount = 0;

    struct ParticipantDetailsByStage {
        uint256 totalReceivedETH;
        uint256 returnedETH;		    
        uint256 committedETH;
        uint256 withdrawnETH;		    
        uint256 allocatedETH;           
        uint256 reservedTokens;         
        uint256 boughtTokens;	        
        uint256 returnedTokens;	        
    }

    

    enum ApplicationEventTypes {
        NOT_SET,                
        CONTRIBUTION_NEW,       
        CONTRIBUTION_CANCEL,    
        PARTICIPANT_CANCEL,     
        COMMITMENT_ACCEPTED,    
        WHITELIST_APPROVE,      
        WHITELIST_REJECT,       
        PROJECT_WITHDRAW        
    }

    event ApplicationEvent (
        uint8 indexed _type,
        uint32 indexed _id,
        address indexed _address,
        uint256 _value
    );

    enum TransferTypes {
        NOT_SET,                
        AUTOMATIC_RETURN,       
        WHITELIST_REJECT,       
        PARTICIPANT_CANCEL,     
        PARTICIPANT_WITHDRAW,   
        PROJECT_WITHDRAW        
    }

    event TransferEvent (
        uint8 indexed _type,
        address indexed _address,
        uint256 indexed _value
    );


    


    
    constructor() public {
        deployerAddress = msg.sender;
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }


    function init(
        address _tokenContractAddress,
        address _whitelistControllerAddress,
        address _projectWalletAddress,
        uint256 _commitPhaseStartBlock,
        uint256 _commitPhaseBlockCount,
        uint256 _commitPhasePrice,
        uint8   _stageCount,
        uint256 _stageBlockCount,
        uint256 _stagePriceIncrease
    )
        public
        onlyDeployer
        isNotInitialized
    {

        
        tokenContractAddress = _tokenContractAddress;
        whitelistControllerAddress = _whitelistControllerAddress;
        projectWalletAddress = _projectWalletAddress;

        
        commitPhaseStartBlock = _commitPhaseStartBlock;
        commitPhaseBlockCount = _commitPhaseBlockCount;
        commitPhaseEndBlock = _commitPhaseStartBlock + _commitPhaseBlockCount;
        commitPhasePrice = _commitPhasePrice;

        stageBlockCount = _stageBlockCount;


        
        tokenContract = IERC777(tokenContractAddress);


        
        Stage storage stage0 = stages[stageCount]; 
        stage0.startBlock = _commitPhaseStartBlock;
        stage0.endBlock = _commitPhaseStartBlock + _commitPhaseBlockCount;
        stage0.tokenPrice = _commitPhasePrice;

        stageCount++; 


        
        uint256 lastStageBlockEnd = stage0.endBlock;

        for(uint8 i = 1; i <= _stageCount; i++) {

            Stage storage stageN = stages[stageCount]; 
            stageN.startBlock = lastStageBlockEnd + 1;
            stageN.endBlock = lastStageBlockEnd + _stageBlockCount + 1;
            stageN.tokenPrice = _commitPhasePrice + ( _stagePriceIncrease * (i) );

            stageCount++; 

            lastStageBlockEnd = stageN.endBlock;
        }

        buyPhaseStartBlock = commitPhaseEndBlock + 1;
        buyPhaseEndBlock = lastStageBlockEnd;
        buyPhaseBlockCount = lastStageBlockEnd - buyPhaseStartBlock;

        initialized = true;
    }

    

    
    function ()
    external
    payable
    isInitialized
    isNotFrozen
    {
        
        if(msg.value >= minContribution) {
            commit();

            
            
        } else {
            cancel();
        }
    }

    
    function tokensReceived(
        address,
        address _from,
        address,
        uint256 _amount,
        bytes calldata,
        bytes calldata
    )
    external
    isInitialized
    
    
    {
        
        
        require(msg.sender == address(tokenContract), "Invalid token sent.");

        
        if(_from == projectWalletAddress) {
            
            
            tokenSupply += _amount;
            return;
        } else {

            
            withdraw(_from, _amount);
        }

    }

    
    function cancel()
    public
    isInitialized
    isNotFrozen
    {
        require(
            participantsByAddress[msg.sender].whitelisted != true,
            "Commitment canceling only possible using tokens after you got whitelisted."
        );

        if(canCancelByEth(msg.sender)) {
            cancelContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.PARTICIPANT_CANCEL));
            return;
        }
        revert("Participant has no contributions.");
    }

    
    function projectWithdraw(uint256 _ethAmount)
    external
    isInitialized
    {
        require(msg.sender == projectWalletAddress, "Only project wallet address.");

        uint256 unlocked = getProjectAvailableEth();
        require(_ethAmount <= unlocked, "Requested amount to large, not enough unlocked ETH available.");

        projectWithdrawCount++;
        projectWithdrawnETH += _ethAmount;


        emit ApplicationEvent(
            uint8(ApplicationEventTypes.PROJECT_WITHDRAW),
            uint32(projectWithdrawCount),
            projectWalletAddress,
            _ethAmount
        );

        emit TransferEvent(uint8(TransferTypes.PROJECT_WITHDRAW), projectWalletAddress, _ethAmount);
        address(uint160(projectWalletAddress)).transfer(_ethAmount);
    }

    function getProjectAvailableEth() public view returns (uint256 _amount) {

        uint256 remainingFromAllocation = 0;
        if(projectAllocatedETH > projectWithdrawnETH) {
            remainingFromAllocation = projectAllocatedETH.sub(projectWithdrawnETH);
        }

        
        uint256 globalAvailable = committedETH
            .sub(withdrawnETH)
            .sub(projectWithdrawnETH)
            .sub(remainingFromAllocation);

        
        uint256 unlocked = globalAvailable.mul(
            getCurrentUnlockPercentage()
        ).div(10 ** 20);

        return unlocked.add(remainingFromAllocation);
    }

    
    function whitelist(
        address _address,
        bool _approve
    )
    public
    isInitialized
    isNotFrozen
    onlyWhitelistController
    {
        Participant storage participantRecord = participantsByAddress[_address];

        if(_approve) {
            participantRecord.whitelisted = true;

            
            acceptContributionsForAddress(_address, uint8(ApplicationEventTypes.WHITELIST_APPROVE));

        } else {
            participantRecord.whitelisted = false;

            
            cancelContributionsForAddress(_address, uint8(ApplicationEventTypes.WHITELIST_REJECT));
        }

    }

    
    function whitelistMultiple(address[] memory _address, bool _approve) public {
        for( uint16 i = 0; i < _address.length; i++ ) {
            whitelist(_address[i], _approve);
        }
    }

    

    

    function isWhitelisted(address _address) public view returns ( bool ) {
        return participantsByAddress[_address].whitelisted;
    }

    
    function getCurrentStage() public view returns ( uint8 ) {
        return getStageAtBlock(getCurrentBlockNumber());
    }

    function getCurrentPrice() public view returns ( uint256 ) {
        return getPriceAtBlock(getCurrentBlockNumber());
    }

    function getPriceAtBlock(uint256 _blockNumber) public view returns ( uint256 ) {
        uint8 stage = getStageAtBlock(_blockNumber);
        if(stage < stageCount) {
            return stages[stage].tokenPrice;
        }
        
        return 0;
    }

    function getTokenAmountForEthAtStage(uint256 _ethValue, uint8 _stageId) public view returns (uint256) {
        
        

        
        
        return _ethValue.mul(
            (10 ** 18)
        ).div( stages[_stageId].tokenPrice );
    }

    function getEthAmountForTokensAtStage(uint256 _tokenAmount, uint8 _stageId) public view returns (uint256) {
        
        return _tokenAmount.mul(
            stages[_stageId].tokenPrice
        ).div(
            (10 ** 18)
        );
    }

    

    
    function getParticipantDetailsByStage(
        address _address,
        uint8 _stageId
    ) public view returns (
        uint256 stageCommittedETH,
        uint256 stageReturnedETH,
        uint256 stageAcceptedETH,
        uint256 stageWithdrawnETH,
        uint256 stageReservedTokens,
        uint256 stageBoughtTokens,
        uint256 stageReturnedTokens
    ) {

        ParticipantDetailsByStage storage totalsRecord = participantsByAddress[_address]
        .byStage[_stageId];

        return (
            totalsRecord.totalReceivedETH,
            totalsRecord.returnedETH,
            totalsRecord.committedETH,
            totalsRecord.withdrawnETH,
            totalsRecord.reservedTokens,
            totalsRecord.boughtTokens,
            totalsRecord.returnedTokens
        );
    }

    
    function getLockedTokenAmount(address _participantAddress) public view returns (uint256) {

        
        
        return getLockedTokenAmountAtBlock(
            participantsByAddress[_participantAddress].reservedTokens +
            participantsByAddress[_participantAddress].boughtTokens,
            getCurrentBlockNumber()
        ) - participantsByAddress[_participantAddress].returnedTokens;
    }

    
    function getCancelModes(address _participantAddress) external view returns (bool byEth, bool byTokens) {

        Participant storage participantRecord = participantsByAddress[_participantAddress];

        if(participantRecord.whitelisted == true) {
            
            byTokens = canCancelByTokens(_participantAddress);
        } else {
            
            byEth = canCancelByEth(_participantAddress);
        }
    }

    function canCancelByTokens(address _participantAddress) public  view  returns (bool) {
        if(getLockedTokenAmount(_participantAddress) > 0) {
            return true;
        }
        return false;
    }

    function canCancelByEth(address _participantAddress) public view returns (bool) {
        Participant storage participantRecord = participantsByAddress[_participantAddress];
        if(participantRecord.totalReceivedETH > 0 && participantRecord.totalReceivedETH > participantRecord.returnedETH ) {
            return true;
        }
        return false;
    }

    

    

    
    function getCurrentBlockNumber() public view returns (uint256) {
        return block.number;
    }

    function getStageAtBlock(uint256 _selectedBlock) public view returns ( uint8 ) {

        
        
        
        
        
        
        
        

        
        if ( _selectedBlock <= commitPhaseEndBlock ) {
            return 0;
        }

        
        
        uint256 num = (_selectedBlock - commitPhaseEndBlock) / (stageBlockCount + 1) + 1;

        
        if(stages[uint8(num)-1].endBlock == _selectedBlock) {
            
            return uint8(num - 1);
        }

        
        
        if(num >= stageCount) {
            return 255;
        }

        return uint8(num);
    }

    
    function availableEthAtStage(uint8 _stage) public view returns (uint256) {
        return tokenContract.balanceOf(address(this)).mul(
            stages[_stage].tokenPrice
        ).div( 10 ** 18 );
    }

    
    function getLockedTokenAmountAtBlock(uint256 _tokenAmount, uint256 _blockNumber) public view returns (uint256) {

        if(_tokenAmount > 0) {

            
            
            
            
            
            
            if(_blockNumber < buyPhaseStartBlock) {

                
                return _tokenAmount;

            } else if(_blockNumber < buyPhaseEndBlock) {

                
                uint8 precision = 20;
                uint256 bought = _tokenAmount;

                uint256 unlocked = bought.mul(
                    getCurrentUnlockPercentage()
                ).div(10 ** uint256(precision));

                return bought.sub(unlocked);

            } else {

                
                return 0;
            }
        } else {
            return 0;
        }
    }

    
    function getCurrentUnlockPercentage() public view returns(uint256) {
        uint8 precision = 20;
        uint256 currentBlock = getCurrentBlockNumber();

        if(currentBlock > buyPhaseStartBlock && currentBlock < buyPhaseEndBlock) {
            uint256 passedBlocks = currentBlock.sub(buyPhaseStartBlock);
            return passedBlocks.mul(
                10 ** uint256(precision)
            ).div(buyPhaseBlockCount);
        } else if (currentBlock >= buyPhaseEndBlock) {
            return 0; 
        } else {
            return 0; 
        }
    }


    

    

    
    function commit()
    internal
    isInitialized
    isNotFrozen
    {
        
        totalReceivedETH += msg.value;

        
        Participant storage participantRecord = participantsByAddress[msg.sender];

        
        if(participantRecord.contributionsCount == 0) {
            
            participantCount++;

            
            participantsById[participantCount] = msg.sender;
        }

        
        recordNewContribution(msg.sender, msg.value);

        
        if(participantRecord.whitelisted == true) {
            acceptContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.COMMITMENT_ACCEPTED));
        }
    }

    
    function withdraw(address _from, uint256 _returnedTokenAmount) internal {

        
        
        

        Participant storage participantRecord = participantsByAddress[_from];

        
        if(participantRecord.whitelisted == true) {

            uint256 currentBlockNumber = getCurrentBlockNumber();

            
            
            uint256 remainingTokenAmount = _returnedTokenAmount;
            uint256 maxLocked = getLockedTokenAmount(_from);
            uint256 returnTokenAmount;
            uint256 allocatedEthAmount = 0;

            if(remainingTokenAmount > maxLocked) {
                returnTokenAmount = remainingTokenAmount - maxLocked;
                remainingTokenAmount = maxLocked;
            }

            projectAllocatedETH = projectAllocatedETH.sub(participantRecord.allocatedETH);

            if(remainingTokenAmount > 0) {

                
                
                
                
                
                

                uint256 returnETHAmount; 

                uint8 currentStageNumber = getCurrentStage();
                for( uint8 stageId = currentStageNumber; stageId >= 0; stageId-- ) {

                    
                    uint256 totalInStage = participantRecord.byStage[stageId].reservedTokens +
                        participantRecord.byStage[stageId].boughtTokens -
                        participantRecord.byStage[stageId].returnedTokens;

                    
                    

                    uint256 tokensInStage = getLockedTokenAmountAtBlock(
                        participantRecord.byStage[stageId].reservedTokens +
                        participantRecord.byStage[stageId].boughtTokens,
                        currentBlockNumber
                    ) - participantRecord.byStage[stageId].returnedTokens;

                    
                    if(tokensInStage > 0) {

                        if (remainingTokenAmount < tokensInStage ) {
                            tokensInStage = remainingTokenAmount;
                        }
                        uint256 currentETHAmount = getEthAmountForTokensAtStage(tokensInStage, stageId);

                        participantRecord.returnedTokens += tokensInStage;
                        participantRecord.byStage[stageId].returnedTokens += tokensInStage;

                        
                        returnETHAmount = returnETHAmount.add(currentETHAmount);
                        participantRecord.byStage[stageId].withdrawnETH += currentETHAmount;

                        
                        uint256 unlockedETHAmount = getEthAmountForTokensAtStage(
                            totalInStage.sub(tokensInStage),    
                            stageId
                        );

                        allocatedEthAmount += unlockedETHAmount;
                        participantRecord.byStage[stageId].allocatedETH = unlockedETHAmount;

                        
                        remainingTokenAmount = remainingTokenAmount.sub(tokensInStage);

                        
                        if(remainingTokenAmount == 0) {
                            break;
                        }
                    }
                }

                if(returnTokenAmount > 0) {
                    

                    
                    bytes memory data;
                    
                    tokenContract.send(_from, returnTokenAmount, data);
                }

                participantRecord.withdrawnETH += returnETHAmount;

                
                withdrawnETH += returnETHAmount;

                
                participantRecord.allocatedETH = allocatedEthAmount;
                projectAllocatedETH = projectAllocatedETH.add(participantRecord.allocatedETH);

                participantRecord.withdrawnETH += returnETHAmount;
                address(uint160(_from)).transfer(returnETHAmount);
                emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _from, returnETHAmount);
                return;
            }
        }
        
        revert("Withdraw not possible. Participant has no locked tokens.");
    }

    
    
    
    function recordNewContribution(address _from, uint256 _receivedValue) internal {
        uint8 currentStage = getCurrentStage();
        Participant storage participantRecord = participantsByAddress[_from];

        
        participantRecord.contributionsCount++;
        participantRecord.totalReceivedETH += _receivedValue;

        
        ParticipantDetailsByStage storage byStage = participantRecord.byStage[currentStage];
        byStage.totalReceivedETH += _receivedValue;

        
        
        uint256 newTokenAmount = getTokenAmountForEthAtStage(
            _receivedValue, currentStage
        );
        byStage.reservedTokens += newTokenAmount;
        participantRecord.reservedTokens += newTokenAmount;

        emit ApplicationEvent(
            uint8(ApplicationEventTypes.CONTRIBUTION_NEW),
            uint32(participantRecord.contributionsCount),
            _from,
            _receivedValue
        );
    }

    function acceptContributionsForAddress(
        address _from,
        uint8 _eventType
    )
    internal
    {
        Participant storage participantRecord = participantsByAddress[_from];

        uint8 currentStage = getCurrentStage();
        for(uint8 i = 0; i <= currentStage; i++) {
            uint8 stageId = i;

            ParticipantDetailsByStage storage byStage = participantRecord.byStage[stageId];

            uint256 processedTotals = participantRecord.committedETH + participantRecord.returnedETH;

            if(processedTotals < participantRecord.totalReceivedETH) {

                
                participantRecord.reservedTokens -= byStage.reservedTokens;
                byStage.reservedTokens = 0;

                uint256 maxAcceptableValue = availableEthAtStage(currentStage);

                uint256 newAcceptedValue = byStage.totalReceivedETH - byStage.committedETH;
                uint256 returnValue = 0;

                
                

                if(newAcceptedValue > maxAcceptableValue) {
                    newAcceptedValue = maxAcceptableValue;
                    returnValue = byStage.totalReceivedETH - byStage.returnedETH - byStage.committedETH -
                    byStage.withdrawnETH - newAcceptedValue;

                    
                    returnedETH += returnValue;
                    participantRecord.returnedETH += returnValue;
                    byStage.returnedETH = returnValue;
                }

                if(newAcceptedValue > 0) {

                    
                    committedETH += newAcceptedValue;
                    participantRecord.committedETH += newAcceptedValue;

                    byStage.committedETH += newAcceptedValue;

                    uint256 newTokenAmount = getTokenAmountForEthAtStage(
                        newAcceptedValue, stageId
                    );

                    byStage.boughtTokens += newTokenAmount;
                    participantRecord.boughtTokens += newTokenAmount;

                    
                    bytes memory data;
                    
                    tokenContract.send(_from, newTokenAmount, data);
                }

                
                
                if(returnValue > 0) {
                    address(uint160(_from)).transfer(returnValue);
                    emit TransferEvent(uint8(TransferTypes.AUTOMATIC_RETURN), _from, returnValue);
                }

                emit ApplicationEvent(_eventType, uint32(stageId), _from, newAcceptedValue);
            }
        }
    }

    function cancelContributionsForAddress(
        address _from,
        uint8 _eventType
    )
    internal
    {

        Participant storage participantRecord = participantsByAddress[_from];
        

        
        
        
        uint256 participantAvailableETH = participantRecord.totalReceivedETH -
            participantRecord.withdrawnETH -
            participantRecord.returnedETH;

        if(participantAvailableETH > 0) {
            
            returnedETH += participantAvailableETH;

            
            participantRecord.reservedTokens = 0;
            participantRecord.withdrawnETH += participantAvailableETH;

            
            
            
            returnedETH += participantAvailableETH;

            
            address(uint160(_from)).transfer(participantAvailableETH + msg.value);

            uint8 currentTransferEventType;
            if(_eventType == uint8(ApplicationEventTypes.WHITELIST_REJECT)) {
                currentTransferEventType = uint8(TransferTypes.WHITELIST_REJECT);
            } else if (_eventType == uint8(ApplicationEventTypes.PARTICIPANT_CANCEL)) {
                currentTransferEventType = uint8(TransferTypes.PARTICIPANT_CANCEL);
            }
            emit TransferEvent(currentTransferEventType, _from, participantAvailableETH);

            emit ApplicationEvent(
                _eventType,
                uint32(participantRecord.contributionsCount),
                _from,
                participantAvailableETH
            );
        } else {
            revert("Participant has not contributed any ETH yet.");
        }
    }


    

    modifier onlyDeployer() {
        require(msg.sender == deployerAddress, "Only the deployer can call this method.");
        _;
    }

    modifier onlyWhitelistController() {
        require(msg.sender == whitelistControllerAddress, "Only the whitelist controller can call this method.");
        _;
    }

    modifier isInitialized() {
        require(initialized == true, "Contract must be initialized.");
        _;
    }

    modifier isNotInitialized() {
        require(initialized == false, "Contract is already initialized.");
        _;
    }

    modifier isFrozen() {
        require(frozen == true, "Contract is frozen.");
        _;
    }

    modifier isNotFrozen() {
        require(frozen == false, "Contract can not be frozen.");
        _;
    }

}