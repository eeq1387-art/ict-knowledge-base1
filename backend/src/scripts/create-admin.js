import 'dotenv/config'
import bcrypt from 'bcrypt'
import { prisma } from '../db.js'

const username = process.env.ADMIN_INITIAL_USERNAME?.trim()
const fullname = process.env.ADMIN_INITIAL_FULLNAME?.trim()
const password = process.env.ADMIN_INITIAL_PASSWORD

if (!username || username.length > 80 || !fullname || fullname.length > 160 || !password || password.length < 12 || password.length > 200) {
  console.error('Set ADMIN_INITIAL_USERNAME, ADMIN_INITIAL_FULLNAME, and an ADMIN_INITIAL_PASSWORD of 12–200 characters in backend/.env.')
  process.exitCode = 1
} else {
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.admin.create({ data: { username, fullname, password: passwordHash } })
    console.log(`Created admin account: ${username}`)
  } catch (error) {
    if (error.code === 'P2002') console.error('An admin account with that username already exists.')
    else console.error('Could not create admin account:', error.message)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
