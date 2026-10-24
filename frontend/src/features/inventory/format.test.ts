import { describe, expect, it } from 'vitest'
import { formatPrice, stockLevel, titleCase, vehicleTitle } from './format'

describe('formatPrice', () => {
  it('formats decimal strings as whole-dollar currency', () => {
    expect(formatPrice('35990.00')).toBe('$35,990')
  })

  it('keeps cents when present', () => {
    expect(formatPrice('42990.50')).toBe('$42,990.50')
  })
})

describe('stockLevel', () => {
  it.each([
    [0, 'out'],
    [1, 'low'],
    [2, 'low'],
    [3, 'in'],
    [40, 'in'],
  ])('quantity %i is %s', (quantity, level) => {
    expect(stockLevel(quantity)).toBe(level)
  })
})

describe('labels', () => {
  it('title-cases enum values', () => {
    expect(titleCase('suv')).toBe('SUV')
    expect(titleCase('hatchback')).toBe('Hatchback')
  })

  it('builds a vehicle title without a trailing trim', () => {
    expect(vehicleTitle({ make: 'Ford', model: 'Kuga' })).toBe('Ford Kuga')
  })
})
