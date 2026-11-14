import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { fakeSession } from '../../../core/auth/testing';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function type(el: HTMLElement, selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function render(returnUrl?: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(LoginPage);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows validation errors and sends nothing when the form is empty', async () => {
    const el = await render();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await new Promise((r) => setTimeout(r));
    expect(el.textContent).toContain('This field is required');
  });

  it("shows the server's message on wrong credentials", async () => {
    const el = await render();
    type(el, '#email', 'ramesh@example.com');
    type(el, '#password', 'Wrong@123');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();

    http.expectOne('/api/v1/auth/login').flush(
      { statusCode: 401, message: 'Incorrect email or password' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Incorrect email or password');
  });

  it('logs in and goes to a safe return URL (never an external one)', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const el = await render('https://evil.example.com');
    type(el, '#email', 'ramesh@example.com');
    type(el, '#password', 'Secret@123');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();

    http.expectOne('/api/v1/auth/login').flush(fakeSession());
    await new Promise((r) => setTimeout(r));
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
