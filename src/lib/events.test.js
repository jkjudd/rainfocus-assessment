import { describe, expect, it } from 'vitest'
import { NAMED_COLORS, isNamedColor } from './colors.js'
import {
  cleanEventFields,
  formatCreatedOn,
  formatEventWhen,
  parseCreatedOn,
  pickEventFields,
  sortEventsByCompany,
  validateEventFields,
} from './events.js'

const valid = {
  name: 'Launch',
  description: 'Kickoff',
  company: 'Acme',
  color: 'red',
  isActive: true,
  date: '2021-01-05',
  time: '06:56',
  email: 'team@acme.com',
  phone: '+1 (831) 446-3332',
  address: '697 Brooklyn Road, Northridge',
  image: 'https://example.com/event.png',
}

describe('validateEventFields', () => {
  it('accepts a complete event', () => {
    expect(validateEventFields(valid)).toEqual({})
  })

  it('requires every field and rejects whitespace-only values', () => {
    const errors = validateEventFields({
      name: '  ',
      description: '',
      company: '\t',
      color: ' ',
      date: '',
      time: ' ',
      email: '',
      phone: '',
      address: '  ',
      image: '',
    })
    expect(Object.keys(errors).sort()).toEqual([
      'address', 'color', 'company', 'date', 'description', 'email', 'image', 'isActive',
      'name', 'phone', 'time',
    ])
  })

  it('enforces maximum lengths after trimming', () => {
    expect(validateEventFields({ ...valid, name: 'x'.repeat(101) }).name).toMatch(/100/)
    expect(validateEventFields({ ...valid, name: ` ${'x'.repeat(100)} ` })).toEqual({})
    expect(validateEventFields({ ...valid, description: 'x'.repeat(501) }).description).toBeTruthy()
  })

  it('limits every text field, at exactly its maximum', () => {
    expect(validateEventFields({ ...valid, company: 'x'.repeat(100) })).toEqual({})
    expect(validateEventFields({ ...valid, company: 'x'.repeat(101) }).company).toMatch(/100/)
    expect(validateEventFields({ ...valid, description: 'x'.repeat(500) })).toEqual({})
    expect(validateEventFields({ ...valid, description: 'x'.repeat(501) }).description).toMatch(/500/)
    expect(validateEventFields({ ...valid, address: 'x'.repeat(200) })).toEqual({})
    expect(validateEventFields({ ...valid, address: 'x'.repeat(201) }).address).toMatch(/200/)
  })

  it('only accepts named web colors, ignoring case and surrounding space', () => {
    expect(validateEventFields({ ...valid, color: ' Orange ' })).toEqual({})
    expect(validateEventFields({ ...valid, color: '#ff0000' }).color).toBeTruthy()
    expect(validateEventFields({ ...valid, color: 'reddish' }).color).toBeTruthy()
    expect(validateEventFields({ ...valid, color: 'transparent' }).color).toBeTruthy()
  })

  it('only accepts real calendar dates in YYYY-MM-DD form', () => {
    expect(validateEventFields({ ...valid, date: '2024-02-29' })).toEqual({})
    expect(validateEventFields({ ...valid, date: '2021-02-29' }).date).toBe('Enter a real date.')
    expect(validateEventFields({ ...valid, date: '2021-13-01' }).date).toBeTruthy()
    expect(validateEventFields({ ...valid, date: '01/05/2021' }).date).toBeTruthy()
  })

  it('only accepts 24-hour HH:MM times', () => {
    expect(validateEventFields({ ...valid, time: '23:59' })).toEqual({})
    expect(validateEventFields({ ...valid, time: '24:00' }).time).toBeTruthy()
    expect(validateEventFields({ ...valid, time: '6:56' }).time).toBeTruthy()
    expect(validateEventFields({ ...valid, time: '06:56:00' }).time).toBeTruthy()
  })

  it('checks the shape of email addresses', () => {
    expect(validateEventFields({ ...valid, email: 'wallsschwartz@geekfarm.com' })).toEqual({})
    expect(validateEventFields({ ...valid, email: 'no-at-sign.com' }).email).toMatch(/email address/)
    expect(validateEventFields({ ...valid, email: 'a@b' }).email).toBeTruthy()
    expect(validateEventFields({ ...valid, email: 'a b@c.com' }).email).toBeTruthy()
    expect(validateEventFields({ ...valid, email: `${'x'.repeat(250)}@a.co` }).email).toMatch(/254/)
  })

  it('accepts phone numbers with at least 7 digits and common punctuation', () => {
    expect(validateEventFields({ ...valid, phone: '555-0100' })).toEqual({})
    expect(validateEventFields({ ...valid, phone: '+44 20 7946 0958' })).toEqual({})
    expect(validateEventFields({ ...valid, phone: '555-01' }).phone).toMatch(/7 digits/)
    expect(validateEventFields({ ...valid, phone: 'call me' }).phone).toBeTruthy()
    expect(validateEventFields({ ...valid, phone: '555-0100 ext 2' }).phone).toBeTruthy()
  })

  it('only accepts http(s) image URLs', () => {
    expect(validateEventFields({ ...valid, image: 'http://placeimg.com/320/240/arch' })).toEqual({})
    expect(validateEventFields({ ...valid, image: 'placeimg.com/320' }).image).toMatch(/http/)
    expect(validateEventFields({ ...valid, image: 'javascript:alert(1)' }).image).toBeTruthy()
    expect(validateEventFields({ ...valid, image: 'ftp://example.com/a.png' }).image).toBeTruthy()
  })

  it('requires isActive to be a boolean, true or false', () => {
    expect(validateEventFields({ ...valid, isActive: false })).toEqual({})
    expect(validateEventFields({ ...valid, isActive: 'yes' }).isActive).toBeTruthy()
  })
})

describe('colors', () => {
  it('lists the 148 CSS named colors without duplicates', () => {
    expect(NAMED_COLORS).toHaveLength(148)
    expect(new Set(NAMED_COLORS).size).toBe(148)
    expect(isNamedColor('RebeccaPurple')).toBe(true)
  })
})

describe('cleanEventFields', () => {
  it('trims text, lowercases the color and keeps the active flag', () => {
    expect(
      cleanEventFields({
        name: ' A ',
        description: ' B ',
        company: ' C ',
        color: ' TEAL ',
        isActive: false,
        date: ' 2021-01-05 ',
        time: ' 06:56 ',
        email: ' a@b.co ',
        phone: ' 555-0100 ',
        address: ' 1 Main St ',
        image: ' https://example.com/a.png ',
      }),
    ).toEqual({
      name: 'A',
      description: 'B',
      company: 'C',
      color: 'teal',
      isActive: false,
      date: '2021-01-05',
      time: '06:56',
      email: 'a@b.co',
      phone: '555-0100',
      address: '1 Main St',
      image: 'https://example.com/a.png',
    })
  })
})

describe('pickEventFields', () => {
  it('fills properties an older event lacks, leaving isActive unset (null)', () => {
    expect(pickEventFields({ id: 1, name: 'A', description: 'B', company: 'C', color: 'red' })).toEqual({
      name: 'A',
      description: 'B',
      company: 'C',
      color: 'red',
      isActive: null,
      date: '',
      time: '',
      email: '',
      phone: '',
      address: '',
      image: '',
    })
  })

  it('keeps isActive false and drops properties the form does not edit', () => {
    const fields = pickEventFields({ ...valid, id: 1, isActive: false, createdOn: 'x' })
    expect(fields.isActive).toBe(false)
    expect(fields).not.toHaveProperty('id')
    expect(fields).not.toHaveProperty('createdOn')
  })
})

describe('createdOn', () => {
  it('formats a date like the API example, with the local offset, and parses it back', () => {
    const date = new Date(2020, 8, 5, 3, 56, 56)
    const formatted = formatCreatedOn(date)
    expect(formatted).toMatch(/^2020-09-05T03:56:56 [+-]\d{2}:\d{2}$/)
    expect(parseCreatedOn(formatted).getTime()).toBe(date.getTime())
  })

  it('parses the API example and rejects anything else', () => {
    expect(parseCreatedOn('2020-09-05T03:56:56 +06:00').toISOString()).toBe('2020-09-04T21:56:56.000Z')
    expect(parseCreatedOn('not a date')).toBeNull()
    expect(parseCreatedOn('')).toBeNull()
  })
})

describe('formatEventWhen', () => {
  it('combines date and time, and leaves out whatever is missing or invalid', () => {
    const both = formatEventWhen({ date: '2021-01-05', time: '06:56' })
    expect(both).toMatch(/2021/)
    expect(both).toMatch(/56/)
    expect(formatEventWhen({ date: '2021-01-05', time: '' })).not.toMatch(/56/)
    expect(formatEventWhen({ date: '', time: '06:56' })).not.toMatch(/2000/)
    expect(formatEventWhen({ date: '2021-02-30', time: 'nope' })).toBe('')
    expect(formatEventWhen({})).toBe('')
  })
})

describe('sortEventsByCompany', () => {
  it('sorts alphabetically by company, case-insensitively, then by name', () => {
    const events = [
      { id: 1, company: 'ZILCH', name: 'b' },
      { id: 2, company: 'anocha', name: 'z' },
      { id: 3, company: 'GEEKFARM', name: 'a' },
      { id: 4, company: 'Anocha', name: 'a' },
    ]
    expect(sortEventsByCompany(events).map((event) => event.id)).toEqual([4, 2, 3, 1])
  })

  it('does not mutate its input', () => {
    const events = [
      { id: 1, company: 'B', name: '' },
      { id: 2, company: 'A', name: '' },
    ]
    sortEventsByCompany(events)
    expect(events[0].id).toBe(1)
  })
})
