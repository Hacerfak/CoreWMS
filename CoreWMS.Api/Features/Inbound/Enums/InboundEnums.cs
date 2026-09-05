namespace CoreWMS.Api.Features.Inbound.Enums;

public enum InboundOrderStatus
{
    PendingReview = 1,
    AwaitingDock = 2,
    AwaitingReceiving = 3,
    Receiving = 4,
    Finished = 5,
    Canceled = 6
}

public enum InboundItemStatus
{
    PendingReview = 1,
    AwaitingDock = 2,
    AwaitingReceiving = 3,
    Receiving = 4,
    Finished = 5
}

public enum HandlingUnitQuality
{
    Good = 1,
    Damaged = 2,
    Missing = 3
}

public enum HandlingUnitStatus
{
    Received = 1,
    Stored = 2,
    Picking = 3,
    Dispatched = 4
}