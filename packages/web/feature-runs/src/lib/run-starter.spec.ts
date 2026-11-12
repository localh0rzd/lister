import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { RunStarter } from './run-starter';

describe('RunStarter', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const apply = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SpaceChanges, useValue: { apply } },
      ],
    });
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    return { starter: TestBed.inject(RunStarter), apply, navigate };
  }

  it('starts one run on a double tap', async () => {
    const { starter, apply, navigate } = setup();

    await Promise.all([starter.adHoc('Groceries'), starter.adHoc('Groceries')]);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('starts another run once the first one has started', async () => {
    const { starter, apply } = setup();

    await starter.adHoc('Groceries');
    await starter.adHoc('Hardware store');

    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('can start again after a refused start', async () => {
    const { starter, apply, navigate } = setup();
    apply.mockResolvedValueOnce(false);

    await starter.adHoc('Groceries');
    await starter.adHoc('Groceries');

    expect(apply).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
