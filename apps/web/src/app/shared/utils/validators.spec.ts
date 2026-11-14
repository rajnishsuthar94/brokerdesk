import { FormControl, FormGroup } from '@angular/forms';
import { indianMobile, matchingPasswords, strongPassword } from './validators';

describe('form validators (UX mirror of API rules)', () => {
  it.each([
    ['', null],
    ['98250 12345', null],
    ['+91 98250 12345', null],
    ['09825012345', null],
    ['12345', { indianMobile: true }],
    ['5825012345', { indianMobile: true }],
    ['98250abcde', { indianMobile: true }],
  ])('indianMobile(%s)', (value, expected) => {
    expect(indianMobile(new FormControl(value))).toEqual(expected);
  });

  it.each([
    ['', null],
    ['Secret@123', null],
    ['password', { password: true }],
    ['12345678', { password: true }],
    ['ab1', { password: true }],
  ])('strongPassword(%s)', (value, expected) => {
    expect(strongPassword(new FormControl(value))).toEqual(expected);
  });

  it('matchingPasswords flags and clears a mismatch on the confirm field', () => {
    const form = new FormGroup(
      { password: new FormControl('Secret@123'), confirmPassword: new FormControl('Other@123') },
      { validators: matchingPasswords() },
    );
    expect(form.controls.confirmPassword.errors).toEqual({ mismatch: true });
    form.controls.confirmPassword.setValue('Secret@123');
    expect(form.controls.confirmPassword.errors).toBeNull();
  });
});
