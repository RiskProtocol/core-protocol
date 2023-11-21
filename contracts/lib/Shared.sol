// SharedStructs.sol
pragma solidity ^0.8.9;

contract Shared {
    /// @notice Struct to store information regarding a scheduled rebase.
    /// @dev This struct holds the data for rebases that are scheduled to be executed.
    struct ScheduledRebase {
        // A unique number assigned to each rebase, used to manage execution order and guard againts duplicates
        uint256 sequenceNumber;
        //Indicates whether this is a natural rebase (occurs at regular planned intervals) or an early rebase.
        bool isNaturalRebase;
        // The price of the underlying asset at the rebase time
        uint256 price;
        // The price of the smart token X at the rebase time
        uint256 smartTokenXprice;
    }
}
