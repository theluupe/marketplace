jest.mock('./studioHelper', () => ({ StudioManagerClient: jest.fn() }));

const { StudioManagerClient } = require('./studioHelper');
const { generateScript } = require('./scriptManager');

const MINUTE = 60 * 1000;
const NO_EVENTS = { data: { data: [], meta: { perPage: 10 } } };

describe('generateScript, the saved place and the poll time', () => {
  let getScriptSequence;
  let queryEvents;

  beforeEach(() => {
    jest.useFakeTimers();
    ['log', 'warn', 'error'].forEach(level =>
      jest.spyOn(console, level).mockImplementation(() => {})
    );
    getScriptSequence = jest.fn();
    StudioManagerClient.mockImplementation(() => ({
      getScriptSequence,
      updateScriptSequence: jest.fn(),
    }));
    queryEvents = jest.fn().mockResolvedValue(NO_EVENTS);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const start = () => generateScript('notifyUserCreated', queryEvents, jest.fn());

  it("doesn't poll until the saved place is read, trying again each minute", async () => {
    getScriptSequence
      .mockResolvedValueOnce({}) // a failed call (the client's empty answer)
      .mockRejectedValueOnce(new Error('webapp down'))
      .mockResolvedValueOnce({ success: true, sequenceId: 42 });

    start();
    await jest.advanceTimersByTimeAsync(0);
    expect(getScriptSequence).toHaveBeenCalledTimes(1);
    expect(queryEvents).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(getScriptSequence).toHaveBeenCalledTimes(2);
    expect(queryEvents).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(getScriptSequence).toHaveBeenCalledTimes(3);
    expect(queryEvents).toHaveBeenCalledTimes(1);
    expect(queryEvents).toHaveBeenCalledWith({ startAfterSequenceId: 42, perPage: 10 });
  });

  it('starts from now only when the webapp answers that no place is stored', async () => {
    getScriptSequence.mockResolvedValue({ success: true, sequenceId: undefined });

    start();
    await jest.advanceTimersByTimeAsync(0);

    expect(queryEvents).toHaveBeenCalledWith({ createdAtStart: expect.any(Date), perPage: 10 });
  });

  it('polls again 2 minutes after a page with no new events', async () => {
    getScriptSequence.mockResolvedValue({ success: true, sequenceId: 42 });

    start();
    await jest.advanceTimersByTimeAsync(0);
    expect(queryEvents).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2 * MINUTE - 1000);
    expect(queryEvents).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(queryEvents).toHaveBeenCalledTimes(2);
  });
});
